import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/services/api_client.dart';
import '../../../../core/theme/app_colors.dart';
import 'asset_scan_result_screen.dart';

/// Native camera scanner with a Zia fallback button.
///
/// Flow:
///   1. The camera continuously scans for QR codes.
///   2. On detection, we extract the `dsync://asset-scan/<token>` token and
///      hit `GET /assets/scan/<token>`.
///   3. If the camera struggles (low light, damaged sticker), the user taps
///      "Upload photo" — we POST the image to `/assets/scan/decode` which
///      decodes it server-side via Zia Barcode Scanner.
///
/// Either path returns the same payload, which we hand to [AssetScanResultScreen].
class AssetScannerScreen extends ConsumerStatefulWidget {
  const AssetScannerScreen({super.key});

  @override
  ConsumerState<AssetScannerScreen> createState() => _AssetScannerScreenState();
}

class _AssetScannerScreenState extends ConsumerState<AssetScannerScreen> {
  // Several Android devices (esp. mid-range Oppo / Realme / Xiaomi running
  // Android 13–14) ship a Camera2 implementation whose default frame format
  // ML Kit can't read — the preview renders fine but `onDetect` never fires.
  // The fixes that landed in mobile_scanner 5.x for this:
  //   • `useNewCameraSelector: true` → routes through CameraX which produces
  //     YUV_420_888 frames ML Kit reliably decodes.
  //   • Explicit `cameraResolution` so we don't hit a 4K-by-default profile
  //     that some chipsets can't downscale fast enough to keep frame parity.
  //   • Restrict to `qrCode` so the decoder doesn't waste cycles on Code128
  //     / DataMatrix and pick the wrong slice.
  //   • Tight `detectionTimeoutMs` so a stuck frame doesn't gate the next.
  // Without these the same QR scans instantly in the Zia upload path (server
  // decoder) but the on-device camera path stays silent — exactly the
  // behaviour reported.
  // Dense QRs (≥ Version 10 — see Settings screenshot, the asset stickers
  // pack name+tenant+token so they sit around V12) need more pixels than the
  // 720p default to be readable from a glancing-angle laptop-screen capture.
  // Bumping to 1080p roughly doubles the QR pixel count and was the fix for
  // "image upload decodes / live camera silent". detectionTimeoutMs lowered
  // so we don't drop the next frame after a near-miss.
  final MobileScannerController _controller = MobileScannerController(
    detectionSpeed: DetectionSpeed.normal,
    facing: CameraFacing.back,
    autoStart: true,
    formats: const [BarcodeFormat.qrCode],
    cameraResolution: const Size(1920, 1080),
    useNewCameraSelector: true,
    detectionTimeoutMs: 100,
  );
  bool _busy = false;
  String? _error;
  // Last code the camera decoded — surfaced in a small chip so we can tell
  // whether the scanner is silent (no detection) vs. detecting but the
  // format is being rejected.
  String? _lastDetected;

  @override
  void initState() {
    super.initState();
    // Some Android builds need an explicit start even with autoStart: true —
    // racing the widget mount means the platform side never receives the
    // "begin streaming" signal. Calling start() once here is idempotent
    // (mobile_scanner ignores it if already running).
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      try {
        await _controller.start();
      } catch (_) {/* already running or permission denied */}
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  static const _tokenPrefix = 'dsync://asset-scan/';
  static final _tokenPattern = RegExp(r'^[A-Za-z0-9_-]{20,64}$');

  String? _extractToken(String? raw) {
    if (raw == null) return null;
    final trimmed = raw.trim();
    final candidate = trimmed.startsWith(_tokenPrefix)
        ? trimmed.substring(_tokenPrefix.length)
        : trimmed;
    return _tokenPattern.hasMatch(candidate) ? candidate : null;
  }

  Future<void> _resolveToken(String token) async {
    if (_busy || !mounted) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    await _controller.stop();
    try {
      final raw = await ApiClient.instance.get<Map<String, dynamic>>(
        '${AppConstants.baseAssets}/scan/$token',
        fromJson: (r) => r as Map<String, dynamic>,
      );
      final data = raw['data'];
      if (!mounted) return;
      if (data is Map<String, dynamic>) {
        await Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => AssetScanResultScreen(payload: data),
          ),
        );
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) {
        setState(() => _busy = false);
        await _controller.start();
      }
    }
  }

  Future<void> _onDetect(BarcodeCapture capture) async {
    if (_busy) return; // one resolve at a time
    final raw = capture.barcodes.isNotEmpty
        ? capture.barcodes.first.rawValue
        : null;
    if (raw != null && mounted) {
      setState(() => _lastDetected =
          raw.length > 48 ? '${raw.substring(0, 48)}…' : raw);
    }
    final token = _extractToken(raw);
    if (token == null) {
      if (!mounted) return;
      setState(() => _error =
          raw == null || raw.isEmpty
              ? 'No code detected — hold steady on the sticker'
              : 'Not an asset QR code (got: ${raw.length > 32 ? '${raw.substring(0, 32)}…' : raw})');
      return;
    }
    await _resolveToken(token);
  }

  Future<void> _uploadPhoto() async {
    if (_busy) return;
    final picker = ImagePicker();
    final XFile? file = await picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 2400,
      imageQuality: 90,
    );
    if (file == null || !mounted) return;

    setState(() {
      _busy = true;
      _error = null;
    });
    await _controller.stop();
    try {
      final formData = FormData.fromMap({
        'image': await MultipartFile.fromFile(
          file.path,
          filename: file.name,
        ),
      });
      final raw = await ApiClient.instance.post<Map<String, dynamic>>(
        '${AppConstants.baseAssets}/scan/decode',
        data: formData,
        fromJson: (r) => r as Map<String, dynamic>,
      );
      final data = raw['data'];
      if (!mounted) return;
      if (data is Map<String, dynamic>) {
        await Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => AssetScanResultScreen(payload: data),
          ),
        );
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) {
        setState(() => _busy = false);
        await _controller.start();
        try { await File(file.path).delete(); } catch (_) { /* tmp cleanup best-effort */ }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        title: const Text('Scan Asset QR'),
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            tooltip: 'Toggle torch',
            icon: const Icon(Icons.flash_on_outlined),
            onPressed: () => _controller.toggleTorch(),
          ),
          IconButton(
            tooltip: 'Switch camera',
            icon: const Icon(Icons.cameraswitch_outlined),
            onPressed: () => _controller.switchCamera(),
          ),
        ],
      ),
      body: LayoutBuilder(builder: (ctx, constraints) {
        // Centre a 280×280 scan window on the screen — mobile_scanner only
        // hands frames inside this rect to ML Kit, so the decoder gets a
        // tighter, higher-effective-resolution crop of the QR instead of
        // searching the whole preview. Keeps the reticle and the scan area
        // visually identical so users aim where it actually counts.
        const double size = 280;
        final Rect scanWindow = Rect.fromCenter(
          center: Offset(constraints.maxWidth / 2, constraints.maxHeight / 2),
          width: size,
          height: size,
        );
        return Stack(
          fit: StackFit.expand,
          children: [
            MobileScanner(
              controller: _controller,
              onDetect: _onDetect,
              scanWindow: scanWindow,
              fit: BoxFit.cover,
            ),
            // Reticle — matches the scan window above
            Center(
              child: Container(
                width: size,
                height: size,
                decoration: BoxDecoration(
                  border: Border.all(color: Colors.white.withOpacity(0.85), width: 2),
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
            ),
          if (_busy)
            const Center(
              child: CircularProgressIndicator(color: Colors.white),
            ),
          Positioned(
            left: 16,
            right: 16,
            bottom: 32,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_error != null)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    margin: const EdgeInsets.only(bottom: 12),
                    decoration: BoxDecoration(
                      color: Colors.red.shade900.withOpacity(0.85),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      _error!,
                      style: const TextStyle(color: Colors.white, fontSize: 13),
                      textAlign: TextAlign.center,
                    ),
                  ),
                Text(
                  'Point your camera at the asset sticker',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Colors.white.withOpacity(0.85),
                    fontSize: 14,
                  ),
                ),
                if (_lastDetected != null) ...[
                  const SizedBox(height: 6),
                  // Diagnostic — shows what the camera decoded so QA can tell
                  // whether the scanner is silent (no read) vs. reading
                  // something the validator rejects.
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.08),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.white.withOpacity(0.18)),
                    ),
                    child: Text(
                      'Detected: ${_lastDetected!}',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Colors.white.withOpacity(0.65),
                        fontSize: 11,
                        fontFamily: 'monospace',
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 14),
                FilledButton.icon(
                  onPressed: _busy ? null : _uploadPhoto,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  icon: const Icon(Icons.upload_file_outlined),
                  label: const Text('Upload photo instead'),
                ),
              ],
            ),
          ),
        ],
      );
      }),
    );
  }
}
