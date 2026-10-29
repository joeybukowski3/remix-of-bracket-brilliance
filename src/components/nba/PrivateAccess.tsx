import { useState, type FormEvent } from "react";
import { signIn } from "@/lib/nba/props/hostedClient";

interface PrivateAccessProps {
  onSignedIn: () => void;
}

/** Sign-in for the owner's hosted board. The passphrase goes to the same-origin API once and is not kept in the page. */
export default function PrivateAccess({ onSignedIn }: PrivateAccessProps) {
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || passphrase.length === 0) return;
    setBusy(true);
    setMessage(null);
    const result = await signIn(passphrase);
    setBusy(false);
    setPassphrase("");
    if ("message" in result) setMessage(result.message);
    else onSignedIn();
  };

  return (
    <section className="mx-auto max-w-sm rounded-lg border border-slate-200 bg-white px-5 py-6 shadow-sm" aria-labelledby="nba-private-heading">
      <h2 id="nba-private-heading" className="text-base font-bold text-slate-900">Private NBA board</h2>
      <p className="mt-1 text-[13px] text-slate-600">Sign in to see the owner's NBA props board.</p>
      <form onSubmit={(event) => void submit(event)} className="mt-4 space-y-3">
        <label className="block text-[12px] font-semibold text-slate-700">
          Passphrase
          <input
            type="password"
            name="passphrase"
            autoComplete="current-password"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-[14px] text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
        </label>
        {message ? <p role="alert" className="text-[12px] font-semibold text-red-700">{message}</p> : null}
        <button type="submit" disabled={busy || passphrase.length === 0} className="w-full rounded bg-slate-900 px-3 py-2 text-[13px] font-semibold text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:opacity-50">
          {busy ? "Checking…" : "Sign in"}
        </button>
      </form>
    </section>
  );
}
