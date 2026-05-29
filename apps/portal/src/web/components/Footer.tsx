/**
 * Vendor footer — presents Nahayat as the supplier of this pentest hub, with
 * real contact + company details. Shown on the dashboard and auth screens.
 */
export function Footer() {
  return (
    <footer className="mt-12 border-t border-line pt-8 text-sm text-ink-500">
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-ink-900">
              <span className="text-sm font-extrabold leading-none text-white">N</span>
            </div>
            <span className="font-extrabold tracking-tight text-ink-900">Nahayat</span>
          </div>
          <p className="text-xs leading-relaxed text-ink-500">
            AI-gedreven pentesting voor web-applicaties en on-prem infrastructuur. Geleverd en
            beheerd door Nahayat.
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-400">Contact</div>
          <a href="mailto:contact@nahayat.io" className="block text-ink-700 hover:text-blue-600">
            contact@nahayat.io
          </a>
          <a href="tel:+31133333101" className="block text-ink-700 hover:text-blue-600">
            013 333 3101
          </a>
          <a
            href="https://www.nahayat.io"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-ink-700 hover:text-blue-600"
          >
            nahayat.io
          </a>
          <a
            href="https://linkedin.com/company/nahayat"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-ink-700 hover:text-blue-600"
          >
            LinkedIn
          </a>
        </div>

        <div className="space-y-1.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-400">Adres</div>
          <p className="not-italic leading-relaxed text-ink-700">
            Laarakkerweg 6a
            <br />
            5061 JR Oisterwijk
            <br />
            Noord-Brabant, NL
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-400">Bedrijf</div>
          <p className="leading-relaxed text-ink-700">
            KvK 87541815
            <br />
            BTW NL864324339B01
          </p>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-2 border-t border-line pt-4 text-xs text-ink-400 sm:flex-row sm:items-center sm:justify-between">
        <span>© {new Date().getFullYear()} Nahayat. Alle rechten voorbehouden.</span>
        <span>
          Powered by{' '}
          <a
            href="https://github.com/Virtual-Computing-bv/shannon"
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink-500 hover:text-blue-600"
          >
            Shannon Lite (AGPL-3.0)
          </a>
        </span>
      </div>
    </footer>
  );
}
