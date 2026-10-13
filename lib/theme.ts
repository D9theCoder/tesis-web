export const THEME_KEY = "tesis-theme:v1";

// Only fixed application constants enter this parser-blocking head script.
// It runs before client bundles so a persisted dark theme never paints light.
export const THEME_INIT_SCRIPT = `(()=>{try{const theme=localStorage.getItem(${JSON.stringify(THEME_KEY)})??localStorage.getItem("tesis-theme");document.documentElement.dataset.theme=theme==="dark"?"dark":"light"}catch{document.documentElement.dataset.theme="light"}})()`;
