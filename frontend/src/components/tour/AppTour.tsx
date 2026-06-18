import { useEffect, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { X, ChevronLeft, ChevronRight, ArrowRight, MapPin } from 'lucide-react';
import { useTour } from '../../contexts/TourContext';
import type { TourStep } from '../../contexts/TourContext';

// ── Spotlight sizing ──────────────────────────────────────────────────────────

const PAD = 10;
const TOOLTIP_W = 340;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function measureTarget(selector?: string): Rect | null {
  if (!selector) return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return {
    top: r.top - PAD,
    left: r.left - PAD,
    width: r.width + PAD * 2,
    height: r.height + PAD * 2,
  };
}

// ── Tooltip position ──────────────────────────────────────────────────────────

interface TooltipStyle {
  top?: string;
  left?: string;
  right?: string;
  bottom?: string;
  transform?: string;
}

// Conservative estimated tooltip height — used to clamp so it never overflows
const TOOLTIP_H = 420;

function tooltipStyle(rect: Rect | null, placement: TourStep['placement']): TooltipStyle {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (!rect || placement === 'center') {
    return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  }

  if (placement === 'right') {
    // Place to the right of the spotlight; fall back left-side if no room
    const spaceRight = vw - (rect.left + rect.width);
    const left = spaceRight >= TOOLTIP_W + 24
      ? rect.left + rect.width + 16
      : Math.max(16, rect.left - TOOLTIP_W - 16);

    // Vertically centre on element, then clamp to viewport
    const midY = rect.top + rect.height / 2;
    let top = midY - TOOLTIP_H / 2;
    top = Math.max(16, top);
    if (top + TOOLTIP_H > vh - 16) top = Math.max(16, vh - TOOLTIP_H - 16);

    return { top: `${top}px`, left: `${Math.min(left, vw - TOOLTIP_W - 16)}px` };
  }

  if (placement === 'bottom') {
    const rawLeft = rect.left + rect.width / 2 - TOOLTIP_W / 2;
    const left = Math.max(16, Math.min(rawLeft, vw - TOOLTIP_W - 16));
    let top = rect.top + rect.height + 16;
    if (top + TOOLTIP_H > vh - 16) top = Math.max(16, rect.top - TOOLTIP_H - 16);
    return { top: `${top}px`, left: `${left}px` };
  }

  return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
}

// ── Beacon pulse on target ─────────────────────────────────────────────────────

function Beacon({ rect }: { rect: Rect }) {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  return (
    <div
      style={{
        position: 'fixed',
        top: cy - 10,
        left: cx - 10,
        width: 20,
        height: 20,
        zIndex: 10002,
        pointerEvents: 'none',
      }}
    >
      <span
        style={{
          display: 'block',
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: 'rgb(var(--ds-accent))',
          opacity: 0.9,
          animation: 'ds-tour-ping 1.4s cubic-bezier(0,0,0.2,1) infinite',
        }}
      />
      <span
        style={{
          display: 'block',
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: 'rgb(var(--ds-accent))',
        }}
      />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AppTour() {
  const { isActive, currentStep, steps, nextStep, prevStep, endTour } = useTour();
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const navigate = useNavigate();

  const [rect, setRect] = useState<Rect | null>(null);
  const [opacity, setOpacity] = useState(0);

  const step = steps[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;

  const update = useCallback(() => {
    if (!step) return;
    const r = measureTarget(step.targetSelector);
    setRect(r);
  }, [step]);

  // Fade out → update rect → fade in on step change
  useEffect(() => {
    if (!isActive) { setOpacity(0); return; }

    setOpacity(0);
    const fadeIn = setTimeout(() => {
      update();
      setOpacity(1);
    }, 180);

    return () => clearTimeout(fadeIn);
  }, [isActive, currentStep, update]);

  // Keep rect up-to-date on resize / scroll
  useEffect(() => {
    if (!isActive) return;
    const onResize = () => update();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [isActive, update]);

  // Inject keyframe animation once
  useEffect(() => {
    if (document.getElementById('ds-tour-styles')) return;
    const style = document.createElement('style');
    style.id = 'ds-tour-styles';
    style.textContent = `
      @keyframes ds-tour-ping {
        75%, 100% { transform: scale(2.2); opacity: 0; }
      }
      @keyframes ds-tour-fadein {
        from { opacity: 0; transform: translateY(8px) scale(0.97); }
        to   { opacity: 1; transform: translateY(0)   scale(1); }
      }
    `;
    document.head.appendChild(style);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    if (!isActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') endTour();
      if (e.key === 'ArrowRight' || e.key === 'Enter') nextStep();
      if (e.key === 'ArrowLeft' && !isFirst) prevStep();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isActive, isFirst, nextStep, prevStep, endTour]);

  if (!isActive || !step) return null;

  const ttStyle = tooltipStyle(rect, step.placement);
  const hasSpotlight = !!rect;

  const handleCta = () => {
    if (step.cta?.path && tenantSlug) {
      navigate(`/${tenantSlug}/${step.cta.path}`);
    }
    // On the last step the CTA finishes the tour; on earlier steps it just advances
    if (isLast) {
      endTour();
    } else {
      nextStep();
    }
  };

  const content = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9990,
      }}
    >
      {/* ── Overlay ── */}
      {hasSpotlight ? (
        /* Spotlight cutout via box-shadow */
        <div
          style={{
            position: 'fixed',
            top: rect!.top,
            left: rect!.left,
            width: rect!.width,
            height: rect!.height,
            borderRadius: 14,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.72)',
            pointerEvents: 'none',
            zIndex: 9991,
            transition: 'all 0.28s ease',
            border: '2px solid rgba(var(--ds-accent), 0.5)',
          }}
        />
      ) : (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.72)',
            zIndex: 9991,
          }}
        />
      )}

      {/* ── Beacon pulse ── */}
      {hasSpotlight && <Beacon rect={rect!} />}

      {/* ── Click-blocker backdrop (below spotlight) ── */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9990,
          cursor: 'default',
        }}
        onClick={(e) => e.stopPropagation()}
      />

      {/* ── Tooltip card ── */}
      <div
        style={{
          position: 'fixed',
          zIndex: 9993,
          width: TOOLTIP_W,
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
          opacity,
          transition: 'opacity 0.22s ease',
          animation: 'ds-tour-fadein 0.25s ease both',
          ...ttStyle,
        }}
      >
        <div
          style={{
            background: 'rgb(var(--ds-surface))',
            borderRadius: 20,
            padding: '28px 28px 22px',
            boxShadow: '0 32px 64px rgba(0,0,0,0.38), 0 0 0 1px rgba(var(--ds-border), 0.6)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Decorative accent strip */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 4,
              background: `linear-gradient(90deg, rgb(var(--ds-accent)), rgb(var(--ds-primary)))`,
              borderRadius: '20px 20px 0 0',
            }}
          />

          {/* Header row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, marginTop: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <MapPin size={12} style={{ color: 'rgb(var(--ds-accent))' }} />
              <span style={{
                fontSize: 11, fontWeight: 700,
                letterSpacing: '0.09em', textTransform: 'uppercase',
                color: 'rgb(var(--ds-accent))',
              }}>
                {currentStep + 1} / {steps.length}
              </span>
            </div>
            <button
              onClick={endTour}
              title="Skip tour"
              style={{
                padding: '4px 8px', borderRadius: 8,
                border: '1px solid rgb(var(--ds-border))',
                background: 'transparent',
                cursor: 'pointer',
                color: 'rgb(var(--ds-text-muted))',
                fontSize: 11,
                display: 'flex', alignItems: 'center', gap: 4,
                lineHeight: 1,
              }}
            >
              <X size={11} /> Skip
            </button>
          </div>

          {/* Title */}
          <h3 style={{
            fontSize: 19, fontWeight: 800,
            color: 'rgb(var(--ds-text))',
            marginBottom: 10, lineHeight: 1.3,
          }}>
            {step.title}
          </h3>

          {/* Description */}
          <p style={{
            fontSize: 14, lineHeight: 1.65,
            color: 'rgb(var(--ds-text-muted))',
            marginBottom: 22,
          }}>
            {step.description}
          </p>

          {/* Progress bar */}
          <div style={{
            height: 4, borderRadius: 4,
            background: 'rgb(var(--ds-border))',
            marginBottom: 20, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${((currentStep + 1) / steps.length) * 100}%`,
              background: `linear-gradient(90deg, rgb(var(--ds-accent)), rgb(var(--ds-primary)))`,
              borderRadius: 4,
              transition: 'width 0.35s ease',
            }} />
          </div>

          {/* Step dots */}
          <div style={{ display: 'flex', gap: 5, marginBottom: 20, justifyContent: 'center' }}>
            {steps.map((_, i) => (
              <div
                key={i}
                style={{
                  width: i === currentStep ? 22 : 7,
                  height: 7,
                  borderRadius: 4,
                  background: i === currentStep
                    ? 'rgb(var(--ds-accent))'
                    : i < currentStep
                      ? 'rgba(var(--ds-accent), 0.35)'
                      : 'rgb(var(--ds-border))',
                  transition: 'all 0.3s ease',
                }}
              />
            ))}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {!isFirst && (
              <button
                onClick={prevStep}
                style={{
                  padding: '9px 14px', borderRadius: 10,
                  border: '1px solid rgb(var(--ds-border))',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: 'rgb(var(--ds-text))',
                  fontSize: 13, fontWeight: 500,
                  display: 'flex', alignItems: 'center', gap: 4,
                  transition: 'opacity 0.15s',
                }}
              >
                <ChevronLeft size={14} /> Back
              </button>
            )}

            <div style={{ flex: 1 }} />

            {step.cta ? (
              <>
                <button
                  onClick={nextStep}
                  style={{
                    padding: '9px 14px', borderRadius: 10,
                    border: '1px solid rgb(var(--ds-border))',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: 'rgb(var(--ds-text-muted))',
                    fontSize: 13,
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  {isLast ? 'Stay here' : 'Skip step'}
                </button>
                <button
                  onClick={handleCta}
                  style={{
                    padding: '9px 18px', borderRadius: 10,
                    border: 'none',
                    background: `linear-gradient(135deg, rgb(var(--ds-accent)), rgb(var(--ds-primary)))`,
                    cursor: 'pointer',
                    color: 'rgb(var(--ds-text-inverse))',
                    fontSize: 13, fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: 5,
                    boxShadow: '0 4px 12px rgba(var(--ds-accent), 0.35)',
                  }}
                >
                  {step.cta.label} <ArrowRight size={14} />
                </button>
              </>
            ) : (
              <button
                onClick={nextStep}
                style={{
                  padding: '9px 18px', borderRadius: 10,
                  border: 'none',
                  background: `linear-gradient(135deg, rgb(var(--ds-accent)), rgb(var(--ds-primary)))`,
                  cursor: 'pointer',
                  color: 'rgb(var(--ds-text-inverse))',
                  fontSize: 13, fontWeight: 700,
                  display: 'flex', alignItems: 'center', gap: 5,
                  boxShadow: '0 4px 12px rgba(var(--ds-accent), 0.35)',
                }}
              >
                {isLast ? 'Finish' : 'Next'} {!isLast && <ChevronRight size={14} />}
              </button>
            )}
          </div>

          {/* Keyboard hint */}
          <p style={{
            fontSize: 11, color: 'rgb(var(--ds-text-muted))',
            textAlign: 'center', marginTop: 14, opacity: 0.6,
          }}>
            ← → arrow keys · Esc to skip
          </p>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(content, document.body);
}
