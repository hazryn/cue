import { ref } from 'vue';

const BUNDLE_PATTERN = /\/assets\/index-[\w-]+\.js/;

/** Nazwa głównego pakietu JS, z którym wystartowała ta karta (w dev — brak, Vite nie hashuje). */
const loadedBundle = (() => {
  for (const script of Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]'))) {
    const match = script.src.match(BUNDLE_PATTERN);
    if (match) return match[0];
  }
  return null;
})();

/** Ustawiane, gdy serwer ma już nowszą wersję aplikacji niż ta w karcie. */
export const newVersionAvailable = ref(false);

/**
 * Po wdrożeniu serwer startuje od nowa, więc każda karta łączy się ponownie —
 * wtedy sprawdzamy, czy index.html nie wskazuje już innego pakietu. Bez tego
 * telewizor otwarty przed wdrożeniem grałby do końca wieczoru starym kodem,
 * a telefony po odświeżeniu nowym.
 */
export async function checkForNewVersion(): Promise<boolean> {
  if (!loadedBundle || newVersionAvailable.value) return newVersionAvailable.value;
  try {
    const html = await (await fetch('/', { cache: 'no-store' })).text();
    const current = html.match(BUNDLE_PATTERN)?.[0];
    if (current && current !== loadedBundle) newVersionAvailable.value = true;
  } catch {
    // Brak sieci to nie powód do przeładowania — spróbujemy przy kolejnym połączeniu
  }
  return newVersionAvailable.value;
}
