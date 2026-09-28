/** Router basename for a non-root Vite base (VITE_APP_BASE_PATH); undefined at the site root. Shared by App and the prerender entry. */
export const routerBase = import.meta.env.BASE_URL === "/" ? undefined : import.meta.env.BASE_URL;
