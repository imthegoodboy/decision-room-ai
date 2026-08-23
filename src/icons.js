const paths = {
  home: '<path d="M4.75 10.5 12 4.75l7.25 5.75v8a.75.75 0 0 1-.75.75h-13a.75.75 0 0 1-.75-.75v-8Z"/><path d="M9.25 19.25v-5.5h5.5v5.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  frame: '<path d="M7 3.75H4.5a.75.75 0 0 0-.75.75V7M17 3.75h2.5a.75.75 0 0 1 .75.75V7M7 20.25H4.5a.75.75 0 0 1-.75-.75V17M17 20.25h2.5a.75.75 0 0 0 .75-.75V17"/><path d="M8 12h8M12 8v8"/>',
  compare: '<path d="M5.25 19.25V11.5h3.5v7.75h-3.5ZM10.25 19.25V4.75h3.5v14.5h-3.5ZM15.25 19.25V8h3.5v11.25h-3.5Z"/>',
  challenge: '<path d="M12 3.5a6.5 6.5 0 0 0-3.92 11.68c.58.44.92 1.12.92 1.85v.22h6v-.22c0-.73.34-1.41.92-1.85A6.5 6.5 0 0 0 12 3.5Z"/><path d="M9.5 20.25h5M9 17.25h6M12 7v5l3 1.5"/>',
  commit: '<path d="m4.75 12.25 4.5 4.5 10-10"/>',
  review: '<path d="M20 11.5a8 8 0 1 1-2.35-5.65"/><path d="M20.25 4.5v5h-5M8.5 12h3.5V8.5M12 12l2.5 2.25"/>',
  settings: '<circle cx="12" cy="12" r="3.25"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4.1 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2.3v-4h.1A1.7 1.7 0 0 0 4.1 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06L6.56 3.7l.06.06A1.7 1.7 0 0 0 8.5 4.1a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1v-.1h4v.1A1.7 1.7 0 0 0 15 4.1a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 8.5c.36.28.7.6 1 .98.24.31.38.7.4 1.12v.1h.9v4h-.9v.1c-.02.42-.16.81-.4 1.2Z"/>',
  arrow: '<path d="M5 12h13M13.5 6.5 19 12l-5.5 5.5"/>',
  chevron: '<path d="m8 10 4 4 4-4"/>',
  more: '<circle cx="5" cy="12" r=".75" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r=".75" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r=".75" fill="currentColor" stroke="none"/>',
  trash: '<path d="M4.5 7h15M9 4.25h6M7 7l.75 13h8.5L17 7M9.5 10.25v6.5M14.5 10.25v6.5"/>',
  copy: '<rect x="8" y="8" width="11.5" height="11.5" rx="2"/><path d="M16 8V6.5a2 2 0 0 0-2-2H6.5a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2H8"/>',
  spark: '<path d="m12 3 .8 3.2a6.5 6.5 0 0 0 4.7 4.7l3.2.8-3.2.8a6.5 6.5 0 0 0-4.7 4.7L12 20.4l-.8-3.2a6.5 6.5 0 0 0-4.7-4.7l-3.2-.8 3.2-.8a6.5 6.5 0 0 0 4.7-4.7L12 3Z"/>',
  search: '<circle cx="10.75" cy="10.75" r="6.5"/><path d="m15.5 15.5 4.25 4.25"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  download: '<path d="M12 3.75v11.5M7.5 11l4.5 4.5 4.5-4.5M4 20.25h16"/>',
  print: '<path d="M7 8V3.75h10V8M7 16.25H4.5a1 1 0 0 1-1-1V10a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v5.25a1 1 0 0 1-1 1H17"/><path d="M7 13.25h10v7H7z"/>',
  alert: '<path d="M12 3.5 21 20H3L12 3.5Z"/><path d="M12 9v5M12 17.25v.25"/>',
};

export function icon(name, className = "") {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.spark}</svg>`;
}
