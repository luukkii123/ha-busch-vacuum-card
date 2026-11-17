'use strict';
// Gemeinsame Testhelfer (M24); dateieigene Varianten mit anderer Signatur bleiben lokal.

/** Tiefe Kopie über JSON, wie die Karte Daten von hass erhält. */
const roh = (x) => JSON.parse(JSON.stringify(x));

/** Der offene Kartendialog im Dokument der Umgebung oder null. */
const dialogVon = (u) => u.body.childNodes.find((n) => n.tagName === 'BUSCH-VACUUM-DIALOG') || null;

/** Neuer States-Teil für vacuum.robo: Attribute ergänzen, Zustand optional ersetzen. */
function sauger(haus, attribute = {}, zustand) {
  const alt = haus.states['vacuum.robo'];
  return { 'vacuum.robo': { entity_id: 'vacuum.robo', state: zustand || alt.state, attributes: Object.assign({}, alt.attributes, attribute) } };
}

module.exports = { roh, dialogVon, sauger };
