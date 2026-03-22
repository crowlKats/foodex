// Import CSS files here for hot module reloading to work.
import "./assets/styles.css";

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}
