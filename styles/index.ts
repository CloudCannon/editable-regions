import styles from "./index.css?inline";

const stylesEl = document.createElement("style");
stylesEl.innerHTML = styles;

document.head.appendChild(stylesEl);
