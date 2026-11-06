// Desktop / Steam adapter (Electron). Shipped only in the desktop build.
// The Steam edition is a paid game: no ads, and the rewarded bonuses are claimed for free (P.premium).
(function (OD) {
  "use strict";
  const P = OD.platform, { native } = OD.platformKit;
  if (P.name !== "electron") return;
  P.achievement = id => { if (native && native.achievement) native.achievement(id); };
  P.premium = { owned: () => true };
})(window.OD);
