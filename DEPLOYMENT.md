# Deployment and icon refresh

1. Replace all files in the GitHub Pages repository with this package.
2. Keep the package contents at the published site root so `index.html`,
   `sw.js`, `manifest.webmanifest`, `js/`, `css/` and `icons/` remain together.
3. Commit and push, then wait for GitHub Pages deployment to complete.
4. Open the site while online and refresh once. V22 installs a new service
   worker and application cache.

The welcome screen and in-app header use the new icon immediately after the V22
update. Android and iOS may retain an installed home-screen icon independently
of the web cache. If that OS-level icon remains old, remove the installed PWA
shortcut and install it again after the deployment.
