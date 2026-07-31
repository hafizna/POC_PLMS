import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { PlmsMark } from "../brand/PlmsLogo";

export function LoginView({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const canSubmit = username.trim().length > 0 && password.length > 0;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-brand-ink px-4 py-10">
      <TechGrid />
      <div className="relative w-full max-w-[380px]">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <PlmsMark size={48} className="text-white" />
          <div>
            <div className="text-[22px] font-semibold tracking-[-0.02em] text-white">PLMS</div>
            <div className="mt-0.5 text-[12px] text-white/50">
              Protection Lifecycle Management System
            </div>
          </div>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) onLogin();
          }}
          className="rounded-2xl border border-white/10 bg-white p-7 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.5)]"
        >
          <h1 className="font-display text-[22px] font-bold tracking-[-0.01em] text-ink">
            Masuk ke akun Anda
          </h1>
          <p className="mt-1 text-[13px] text-ink-3">
            Gunakan akun UPT/ULTG/UIT Anda untuk melanjutkan.
          </p>

          <label className="mt-6 block text-[12px] font-medium text-ink-2">
            Username
            <input
              autoFocus
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="mis. dksbi.engineer"
              className="mt-1.5 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-brand-accent-dark focus:ring-2 focus:ring-brand-accent/30"
            />
          </label>

          <label className="mt-4 block text-[12px] font-medium text-ink-2">
            Password
            <div className="relative mt-1.5">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-line bg-white px-3 py-2.5 pr-10 text-sm text-ink outline-none transition-colors focus:border-brand-accent-dark focus:ring-2 focus:ring-brand-accent/30"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-ink-4 hover:text-ink-2"
                aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>

          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-6 w-full rounded-lg bg-brand-ink py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:bg-ink-4"
          >
            Masuk ke aplikasi
          </button>

          <p className="mt-4 text-center text-[11px] text-ink-4">
            Demo/POC — kredensial tidak divalidasi.
          </p>
        </form>

        <p className="mt-6 text-center text-[11px] text-white/35">
          © {new Date().getFullYear()} PLN — Protection Lifecycle Management System
        </p>
      </div>
    </div>
  );
}

// Faint single-line-diagram grid — a nod to the substation/line topology
// this app models, kept subtle enough to read as texture, not decoration.
function TechGrid() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07]"
      aria-hidden="true"
    >
      <defs>
        <pattern id="plms-grid" width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M48 0H0V48" fill="none" stroke="white" strokeWidth="1" />
        </pattern>
        <radialGradient id="plms-fade" cx="50%" cy="38%" r="65%">
          <stop offset="0%" stopColor="white" stopOpacity="1" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <mask id="plms-mask">
          <rect width="100%" height="100%" fill="url(#plms-fade)" />
        </mask>
      </defs>
      <rect width="100%" height="100%" fill="url(#plms-grid)" mask="url(#plms-mask)" />
    </svg>
  );
}
