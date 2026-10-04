import { RenderMode, ServerRoute } from '@angular/ssr';

// The public pages are built ahead of time as static HTML, for search
// engines (taliferro-ui/PRODUCT-STANDARD.md, part 4). They render as the
// signed-out version; the browser takes over once the page loads.
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'help', renderMode: RenderMode.Prerender },
  { path: 'about', renderMode: RenderMode.Prerender },
  { path: 'pricing', renderMode: RenderMode.Prerender },
  { path: 'ios', renderMode: RenderMode.Prerender },
  { path: '**', renderMode: RenderMode.Client },
];
