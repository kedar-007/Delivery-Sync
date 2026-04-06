import React, { useEffect, useRef } from "react";

const FEATURES = [
  { title: "Live Delivery Tracking", desc: "Monitor every shipment in real time.", color: "from-blue-500 to-cyan-500" },
  { title: "Team Synchronisation", desc: "Keep teams perfectly coordinated.", color: "from-violet-500 to-purple-500" },
  { title: "Real-Time Status Updates", desc: "Instant dashboards and alerts.", color: "from-emerald-500 to-teal-500" },
  { title: "Centralised Dispatch Control", desc: "Manage everything from one place.", color: "from-amber-500 to-orange-500" },
];

const MetricTile = ({ value, label, color }: { value: string; label: string; color: string }) => (
  <div className="flex flex-col items-center px-4 py-2 rounded-xl bg-white/5 border border-white/10">
    <span className={`text-lg font-extrabold ${color}`}>{value}</span>
    <span className="text-[10px] text-white/40 uppercase tracking-widest mt-0.5">{label}</span>
  </div>
);

const LeftPanel = () => (
  <div className="hidden lg:flex flex-col h-full bg-slate-950 text-white px-10 py-10">
    <div className="mb-10">
      <p className="text-2xl font-bold">Delivery Sync</p>
      <p className="text-blue-400/70 text-sm">Delivery Intelligence Platform</p>
    </div>
    <div className="flex-1">
      <h1 className="text-6xl font-bold leading-tight mb-10">Track. Sync.<br />Deliver.</h1>
      <div className="space-y-5">
        {FEATURES.map((f) => (
          <div key={f.title} className="flex items-start gap-3">
            <div className={`w-4 h-4 rounded-full mt-1 bg-gradient-to-r ${f.color}`} />
            <div>
              <p className="font-semibold">{f.title}</p>
              <p className="text-sm text-white/60">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
    <div className="flex gap-3 mt-10">
      <MetricTile value="99.9%" label="Uptime" color="text-emerald-400" />
      <MetricTile value="< 1s" label="Sync Lag" color="text-blue-400" />
      <MetricTile value="24/7" label="Support" color="text-violet-400" />
    </div>
  </div>
);

export default function LoginPage() {
  const didInit = useRef(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    const mount = () => {
      const el = document.getElementById("loginDivElementId");
      if (!el) return;

      el.innerHTML = "";

      if ((window as any).catalyst?.auth?.signIn) {
        (window as any).catalyst.auth.signIn("loginDivElementId", {
          service_url: "/app/index.html",
          css_url: `${window.location.origin}/app/embedded_signIn.custom.css`,
          is_customize_forgot_password: true,
          forgot_password_css_url: `${window.location.origin}/app/embedded_password_reset.custom.css`,
        });
      } else {
        console.warn("[DS Login] Catalyst SDK not ready.");
      }
    };

    Promise.resolve().then(() => requestAnimationFrame(mount));

    return () => {
      const el = document.getElementById("loginDivElementId");
      if (el) el.innerHTML = "";
    };
  }, []);

  return (
    <div className="min-h-screen w-full flex overflow-hidden" style={{ background: "#0a0f1e" }}>
      <style>{`
        html, body { overflow: hidden; }
        #loginDivElementId { overflow-x: hidden !important; overflow-y: auto !important; scrollbar-width: none !important; -ms-overflow-style: none !important; }
        #loginDivElementId::-webkit-scrollbar { display: none !important; }
        #loginDivElementId iframe { width: 100% !important; height: 100% !important; border: 0 !important; display: block !important; }
      `}</style>

      <LeftPanel />

      <div className="flex-1 flex flex-col items-center justify-center relative px-6 py-10"
        style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)" }}>

        <div className="pointer-events-none absolute inset-0" style={{
          backgroundImage: "linear-gradient(rgba(99,102,241,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.06) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }} />
        <div className="pointer-events-none absolute top-1/4 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)" }} />

        <div className="relative z-10 w-full max-w-[440px]">
          <div className="mb-6 text-center">
            <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full text-xs font-medium"
              style={{ background: "rgba(99,102,241,0.15)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.3)" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
              Secure · Session protected
            </div>
            <h2 className="text-2xl font-bold text-white mb-1">Welcome back</h2>
            <p className="text-sm" style={{ color: "#94a3b8" }}>Sign in to your organisation account</p>
          </div>

          <div className="rounded-2xl overflow-hidden"
            style={{ background: "#ffffff", border: "1px solid rgba(255,255,255,0.15)", boxShadow: "0 25px 60px rgba(0,0,0,0.4)" }}>
            <div id="loginDivElementId" style={{ height: "clamp(480px, 60dvh, 600px)", width: "100%" }} />
          </div>

          <p className="mt-4 text-center text-xs" style={{ color: "#475569" }}>
            By signing in you agree to the{" "}
            <span style={{ color: "#6366f1", cursor: "default" }}>Terms of Service</span>
            {" "}and{" "}
            <span style={{ color: "#6366f1", cursor: "default" }}>Privacy Policy</span>
          </p>
        </div>
      </div>
    </div>
  );
}
