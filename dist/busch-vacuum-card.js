/* BEGIN BUSCH SHARED UI 0.3.2 sha256:03f8f2772ce4a11e5bc843226fea493d961f9119bc588f6187190e8bc5a663f2 */
/** Busch UI 0.3.2 — standalone Vanilla source. Synchronized verbatim, never imported at runtime. */
const BuschUI = (() => {
  const sourceVersion = '0.3.2';
  const cloneConfig = value => Array.isArray(value) ? value.map(cloneConfig)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key,item]) => [key,cloneConfig(item)])) : value;
  function configsEqual(a,b) {
    if (Object.is(a,b)) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a)!==Array.isArray(b)) return false;
    if (Array.isArray(a) && a.length!==b.length) return false;
    const keys=Object.keys(a);
    return keys.length===Object.keys(b).length && keys.every(key=>Object.hasOwn(b,key)&&configsEqual(a[key],b[key]));
  }
  const validKey = key => !['__proto__','prototype','constructor'].includes(String(key));
  function updateConfig(config,patch) {
    const next=cloneConfig(config||{});
    for (const [key,value] of Object.entries(patch||{})) {
      if (!validKey(key)) throw new Error('Invalid editor config key');
      if (value===undefined) delete next[key]; else next[key]=cloneConfig(value);
    }
    return next;
  }
  function updateConfigPath(config,path,value) {
    const parts=Array.isArray(path)?path:String(path).split('.');
    if (!parts.length || parts.some(key=>!String(key)||!validKey(key))) throw new Error('Invalid editor config path');
    const next=cloneConfig(config||{});let node=next;
    for (let i=0;i<parts.length-1;i++) {const key=parts[i];if (!Object.hasOwn(node,key)||!node[key]||typeof node[key]!=='object') node[key]=typeof parts[i+1]==='number'?[]:{};node=node[key];}
    const key=parts.at(-1);
    if (value===undefined) {if (Array.isArray(node)&&typeof key==='number') node.splice(key,1);else delete node[key];} else node[key]=cloneConfig(value);
    return next;
  }
  const deleteConfigPath=(config,path)=>updateConfigPath(config,path,undefined);
  const editorEchoStates=new WeakMap();
  function editorEchoState(editor) {let state=editorEchoStates.get(editor);if(!state){state=createEchoState();editorEchoStates.set(editor,state);}return state;}
  function emitConfigChanged(editor,config,{echo=true}={}) {
    if(echo)queueEcho(editorEchoState(editor),config);
    editor.dispatchEvent(new CustomEvent('config-changed',{detail:{config:cloneConfig(config)},bubbles:true,composed:true}));
  }
  function guardEditorKeys(root) {
    root.addEventListener?.('keydown',event=>event.stopPropagation());
    root.addEventListener?.('keyup',event=>event.stopPropagation());
  }
  class EditorBase extends (typeof HTMLElement==='undefined'?class{}:HTMLElement) {
    constructor() {super();guardEditorKeys(this);}
    _acceptConfig(config,normalize=cloneConfig,{echo=true}={}) {
      const result=validateConfig(config,{normalize});
      if(!result.ok)throw result.error;
      const next=result.value;
      if (echo?!acceptEcho(editorEchoState(this),next,this._config):configsEqual(next,this._config)) return false;
      this._config=next;return true;
    }
    _publishConfig(config,options) {
      const next=cloneConfig(config);this._config=next;emitConfigChanged(this,next,options);return next;
    }
  }
  // HA supplies no echo ID: match the earliest unacknowledged equal snapshot.
  const createEchoState=()=>({pending:[],received:new Set(),stale:[]});
  function queueEcho(state,config) {state.pending.push(cloneConfig(config));}
  function acceptEcho(state,next,current) {
    const pending=state.pending.findIndex(value=>!state.received.has(value)&&configsEqual(value,next));
    if (pending!==-1) {
      if (pending<state.pending.length-1) {state.received.add(state.pending[pending]);return false;}
      state.stale.push(...state.pending.slice(0,-1).filter(value=>!state.received.has(value)));
      state.pending=[];state.received.clear();
    } else {
      if (configsEqual(current,next)||state.pending.some(value=>state.received.has(value)&&configsEqual(value,next))) return false;
      const stale=state.stale.findIndex(value=>configsEqual(value,next));
      if (stale!==-1) {state.stale.splice(stale,1);return false;}
      state.pending=[];state.received.clear();state.stale=[];
    }
    return !configsEqual(current,next);
  }
  function resolveMedia(config={},metadata={},defaultIcon='mdi:devices') {
    const safe=value=>typeof value==='string'&&value.trim()&&!/^(?:javascript|vbscript|file):/i.test(value.trim())?value.trim():null;
    const available=[metadata.entity_picture,metadata.device_picture,metadata.picture].map(safe).filter(Boolean),custom=safe(config.image),mode=config.display_mode||'auto';
    const images=mode==='icon'?[]:[...new Set((mode==='image'?[custom,...available]:[...available,custom]).filter(Boolean))];
    return {image:images[0]||null,images,icon:config.icon||metadata.icon||defaultIcon};
  }
  function media(config,metadata,defaultIcon,className='card-icon') {
    const resolved=resolveMedia(config,metadata,defaultIcon),holder=document.createElement('span');
    holder.className='busch-media '+className;holder.setAttribute('aria-hidden','true');let index=0;
    const next=()=>{
      if (index>=resolved.images.length) {const icon=ha.icon(resolved.icon);holder.replaceChildren(icon);return;}
      const img=document.createElement('img');img.setAttribute('src',resolved.images[index++]);img.setAttribute('alt','');img.setAttribute('loading','lazy');
      img.addEventListener('error',next,{once:true});holder.replaceChildren(img);
    };
    next();return holder;
  }
  function statusSemantic(status) {
    return ({success:'success',running:'success',online:'success',connected:'success',on:'success',idle:'warning',warning:'warning',partial:'warning',starting:'warning',stopping:'warning',paused:'warning',blocked:'warning',suspended:'warning',error:'error',failed:'error',neutral:'neutral',stopped:'neutral',offline:'neutral',disconnected:'neutral',off:'neutral',unavailable:'unavailable',unknown:'unknown'})[status]||'unknown';
  }
  function statusBadge(status,text,classPrefix='status-') {
    const badge=document.createElement('span');badge.className='status-badge '+classPrefix+statusSemantic(status);badge.textContent=text;return badge;
  }
  function formatNumber(value,locale,options={maximumFractionDigits:1}) {
    return !['number','string'].includes(typeof value)||(typeof value==='string'&&!value.trim())||!Number.isFinite(Number(value))?null:new Intl.NumberFormat(locale||'en',options).format(Number(value));
  }
  function metric(label,value,ratio) {
    const node=document.createElement('div');node.className='metric';
    const caption=document.createElement('span');caption.className='metric-label';caption.textContent=label;
    const text=document.createElement('strong');text.className='metric-value';text.textContent=value;node.appendChild(caption);node.appendChild(text);
    if (ratio!==undefined&&Number.isFinite(ratio)) {const bar=document.createElement('progress');bar.max=100;bar.value=Math.min(100,Math.max(0,ratio*100));bar.setAttribute('aria-label',label);node.appendChild(bar);}return node;
  }
  let helperPromise=null;
  const ha = {
    form() {
      const form=document.createElement('ha-form');
      // HA lazy-loads ha-form. Retain its real selector contract and replay
      // properties after upgrade; a free-text replacement would lose selectors.
      if (typeof customElements!=='undefined' && customElements.get && !customElements.get('ha-form') && customElements.whenDefined) {
        customElements.whenDefined('ha-form').then(()=>{
          const props=['hass','schema','data','computeLabel','computeHelper','computeError','disabled'].filter(key=>Object.hasOwn(form,key)).map(key=>[key,form[key]]);
          for (const [key] of props) delete form[key];
          customElements.upgrade?.(form);
          for (const [key,value] of props) form[key]=value;
        });
      }
      return form;
    },
    input({native=false}={}) {return document.createElement(!native&&typeof customElements!=='undefined'&&customElements.get?.('ha-input')?'ha-input':'input');},
    icon(name) {const icon=document.createElement('ha-icon');icon.setAttribute('icon',name);return icon;},
    async cardHelpers({requireRow=false}={}) {
      if (!helperPromise) {
      if (typeof window==='undefined'||typeof window.loadCardHelpers!=='function') return null;
      helperPromise=Promise.resolve().then(()=>window.loadCardHelpers()).then(helpers=>helpers&&typeof helpers.createCardElement==='function'?helpers:null).catch(()=>null);
      }
      const helpers=await helperPromise;
      if(!helpers||(requireRow&&typeof helpers.createRowElement!=='function')){helperPromise=null;return null;}
      return helpers;
    },
  };
  const tokens=Object.freeze({space1:'var(--ha-space-1, 4px)',space2:'var(--ha-space-2, 8px)',space3:'var(--ha-space-3, 12px)',space4:'var(--ha-space-4, 16px)',mediaRadius:'var(--ha-card-border-radius, 12px)',controlMinHeight:'44px'});
  function language(hass,{legacy=false,browser=true}={}) {
    const code=hass?.locale?.language||(legacy&&hass?.language)||(browser&&typeof navigator!=='undefined'&&navigator.language)||'en';
    return String(code).toLowerCase().startsWith('de')?'de':'en';
  }
  const dictionary=(table,hass,options)=>table[language(hass,options)]||table.en;
  function fieldText(table,hass,name,options) {
    const words=dictionary(table,hass,options),fallback=table.en||{};
    return {label:words?.labels?.[name]??fallback.labels?.[name]??name,helper:words?.helpers?.[name]??fallback.helpers?.[name]??''};
  }
  function validateConfig(input,{parse=false,normalize=cloneConfig,validate}={}) {
    try {
      const copied=cloneConfig(parse?JSON.parse(input):input);
      const error=validate?.(copied);
      if(error) return {ok:false,error:error instanceof Error?error:new Error(String(error))};
      return {ok:true,value:cloneConfig(normalize(copied))};
    } catch(error) {return {ok:false,error};}
  }
  const addClass=(node,name)=>{if(!String(node.className||'').split(/\s+/).includes(name))node.className=((node.className||'')+' '+name).trim();};
  function header({node=document.createElement('div'),titleNode,label}={}) {
    addClass(node,'busch-ui-header');node.setAttribute('role','group');
    const name=label??titleNode?.textContent;if(name)node.setAttribute('aria-label',name);
    if(titleNode){if(!/^H[1-6]$/.test(titleNode.tagName||'')){titleNode.setAttribute('role','heading');titleNode.setAttribute('aria-level','2');}addClass(titleNode,'busch-ui-title');}
    return node;
  }
  const actionBindings=new WeakMap();
  function action({node=document.createElement('button'),label,text,icon,disabled,variant='secondary',onClick}={}) {
    if(!label)throw new Error('Action requires an accessible label');
    addClass(node,'busch-ui-action');node.type='button';node.setAttribute('aria-label',label);node.setAttribute('data-variant',variant);
    if(disabled!==undefined)node.disabled=disabled;
    let binding=actionBindings.get(node);
    if(!binding){
      binding={};actionBindings.set(node,binding);
      // Keep native keyboard activation and owning tablist arrow navigation.
      for(const type of ['keydown','keyup'])node.addEventListener(type,event=>{if(event.key==='Enter'||event.key===' ')event.stopPropagation();});
      node.addEventListener('click',event=>{event.stopPropagation();if(!node.disabled)binding.onClick?.(event);});
    }
    binding.onClick=onClick;
    if(text!==undefined){node.textContent=text;binding.icon=null;}
    if(icon){if(!binding.icon){binding.icon=ha.icon(icon);binding.icon.setAttribute('aria-hidden','true');node.appendChild(binding.icon);}else binding.icon.setAttribute('icon',icon);}
    if(icon||text===undefined){if(!node.title||node.title===binding.tooltip){node.title=label;binding.tooltip=label;}}
    return node;
  }

  function section({title,content,open=false}={}) {
    const node=document.createElement('details');
    addClass(node,'busch-ui-section');node.open=open;
    const summary=document.createElement('summary');summary.textContent=title;node.appendChild(summary);
    if(content)node.appendChild(content);return node;
  }
  // Scoped bases: family layout/grid/padding and domain presentation override
  // these fundamentals. No global selectors or services in shared primitives.
  const cardStyles=`
.busch-ui-header{min-width:0}.busch-ui-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
:where(.busch-ui-action){border:0;border-radius:var(--ha-card-border-radius,12px);padding:var(--ha-space-2,8px) var(--ha-space-3,12px);color:var(--primary-text-color,#212121);background:var(--secondary-background-color,#eeeeee);box-sizing:border-box;min-height:44px;min-width:44px;max-width:100%;font:inherit;cursor:pointer}
:where(.busch-ui-action):focus-visible{outline:2px solid var(--primary-color,#03a9f4);outline-offset:2px}
:where(.busch-ui-action[data-variant=primary]){background:var(--primary-color,#03a9f4);color:var(--text-primary-color,#ffffff)}
:where(.busch-ui-action[data-variant=secondary]){background:var(--secondary-background-color,#eeeeee);color:var(--primary-text-color,#212121)}
:where(.busch-ui-action[data-variant=destructive]),:where(.busch-ui-action[data-variant=danger]){color:var(--error-color,#db4437)}
:where(.busch-ui-action[data-variant=quiet]),:where(.busch-ui-action[data-variant=icon-only]),:where(.busch-ui-action[data-variant=overflow]){background:transparent}
:where(.busch-ui-action):disabled{cursor:default;opacity:0.5}
`;
  const editorStyles=cardStyles+`
:host(.busch-ui-editor),.busch-ui-editor{display:block;min-width:0;color:var(--primary-text-color,#212121);font:inherit}
:host(.busch-ui-editor) ha-form,.busch-ui-editor ha-form{display:block;min-width:0}.busch-ui-section{min-width:0}
.busch-ui-section>summary{cursor:pointer;min-height:44px;box-sizing:border-box;overflow-wrap:anywhere;font-weight:var(--ha-font-weight-medium,500)}
.busch-ui-section>summary:focus-visible{outline:2px solid var(--primary-color,#03a9f4);outline-offset:2px}
.busch-ui-validation{color:var(--error-color,#db4437);overflow-wrap:anywhere;font-size:var(--ha-font-size-s,12px)}
`;
  return Object.freeze({sourceVersion,EditorBase,cloneConfig,configsEqual,updateConfig,updateConfigPath,deleteConfigPath,emitConfigChanged,guardEditorKeys,createEchoState,queueEcho,acceptEcho,resolveMedia,media,statusSemantic,statusBadge,metric,formatNumber,ha,tokens,language,dictionary,fieldText,validateConfig,header,action,section,cardStyles,editorStyles});
})();
/* END BUSCH SHARED UI */

/*
 * busch-vacuum-card — robot vacuum card for Home Assistant (Dreame first).
 *
 * Contains exactly one card: `busch-vacuum-card`. Its functions follow the
 * Dreame Vacuum Card shipped with Tasshack/dreame-vacuum; its code, icons and
 * looks do not — everything here is written from the integration's public
 * entities, attributes and services, styled like the other Busch cards.
 *
 * No build step: this file is source and delivery in one (HACS dashboard
 * repositories ship a single file, no sub folders).
 */

const CARD_VERSION = '0.1.0';

const CARD_TAG = 'busch-vacuum-card';
const EDITOR_TAG = 'busch-vacuum-card-editor';
const DIALOG_TAG = 'busch-vacuum-dialog';
const DIALOG_HISTORY_KEY = 'buschVacuumDialog';

const domainOf = (entityId) => String(entityId || '').split('.')[0];

// ---------------------------------------------------------------------------
// Localisation
// ---------------------------------------------------------------------------

/**
 * The card's ONE dictionary (hacs/docs/ui-regeln.md, rule 3): every string a
 * user can read lives here in both languages. Shape as prescribed by
 * hacs/scripts/ui-regeln-pruefen.py.
 */
const TEXTE_BUSCH_VACUUM_CARD = {
    de: {
        name: 'Busch Saugroboter',
        description: 'Status und Steuerung eines Saugroboters mit allem, was das Gerät kann, auch ohne Karte.',
        labels: {
            entity: 'Saugroboter',
            title: 'Titel',
            scripts: 'Skripte als Shortcuts',
            layout_section: 'Layout',
            full_height: 'Volle Höhe',
            aspect_ratio: 'Seitenverhältnis',
            max_height_offset: 'Höhenabzug',
            left_handed: 'Linkshänder',
            operation_section: 'Bedienung',
            locked: 'Karten-Sperre',
            touch_lock: 'Haltezeit zum Entsperren',
            disable_haptic: 'Vibration aus',
            display_section: 'Anzeige',
            hidden_card_objects: 'Ausgeblendete Teile',
            map_section: 'Karte',
            map_display: 'Kartenansicht',
            color_scheme: 'Farbschema',
            icon_set: 'Symbolsatz',
            hidden_objects: 'Ausgeblendete Kartenobjekte',
            override_colors: 'Eigene Farben',
            map_config: 'Je Stockwerk',
            dark: 'Im dunklen Thema',
            floor: 'Boden',
            wall: 'Wand',
            room: 'Raum',
            carpet: 'Teppich',
            no_go: 'No-Go-Zone',
            no_mop: 'No-Mop-Zone',
            virtual_wall: 'Virtuelle Wand',
            path: 'Reinigungspfad',
            robot: 'Roboter',
            charger: 'Station',
            rotation: 'Drehung',
            scale: 'Kartengröße',
            opacity: 'Deckkraft der Karte',
            object_scale: 'Symbolgröße',
            object_opacity: 'Deckkraft der Symbole',
            font_size: 'Schriftgröße',
            crop: 'Ausschnitt',
            top: 'Oben',
            right: 'Rechts',
            bottom: 'Unten',
            left: 'Links',
            background_image: 'Hintergrundbild',
            overlay_image: 'Überlagerungsbild',
            url: 'Bildadresse',
            x0: 'Linke Kante',
            y0: 'Untere Kante',
            x1: 'Rechte Kante',
            y1: 'Obere Kante'
        },
        helpers: {
            entity: 'Der Saugroboter, den die Karte zeigt; zugehörige Entitäten findet sie über das Gerät. Pflichtfeld ohne Vorgabe.',
            title: 'Überschrift der Karte statt des Gerätenamens. Vorgabe leer, dann steht dort der Gerätename.',
            scripts: 'Skripte, die das Shortcut-Menü vor den Shortcuts des Geräts anbietet. Vorgabe keine.',
            layout_section: 'Höhe und Form der Karte und auf welcher Seite die Aktionsknöpfe liegen.',
            full_height: 'Die Karte füllt die sichtbare Höhe unter der Kopfleiste von Home Assistant. Vorgabe aus.',
            aspect_ratio: 'Feste Form der Karte wie 16:9, 4/3 oder 1.5; gilt nicht mit voller Höhe und nicht im Panel. Vorgabe leer.',
            max_height_offset: 'So viele Pixel zieht die Karte von ihrer größten Höhe ab, etwa für eigene Kopfzeilen. Vorgabe 0.',
            left_handed: 'Legt die Aktionsknöpfe nach links und die Stationsanzeige nach rechts. Vorgabe aus.',
            operation_section: 'Sperre gegen versehentliches Verschieben der Karte und Vibration am Handy.',
            locked: 'Wann die Karte gesperrt startet; Automatisch sperrt am Touchgerät außerhalb einer Panel-Ansicht. Vorgabe Automatisch.',
            touch_lock: 'So lange hältst du das Schloss, um die Sperre umzuschalten, 100 bis 400 Millisekunden. Vorgabe 200.',
            disable_haptic: 'Schaltet die kurze Vibration beim Tippen am Handy ab. Vorgabe aus.',
            display_section: 'Welche Teile die Karte zeigt.',
            hidden_card_objects: 'Gewählte Teile zeigt die Karte nicht; ohne „Bestätigung beim Kartenwechsel“ wechselt sie die Karte ohne Rückfrage. Vorgabe keine.',
            map_section: 'Darstellung der Live-Karte: Ansicht, Farben, Symbole und was sie zeigt.',
            map_display: 'Standard zeigt Räume in eigenen Farben, Grundriss alle Räume in einem Ton mit Konturen (nur mit Kartendaten). Vorgabe Standard.',
            color_scheme: 'Farben der Karte; Automatisch folgt hellem oder dunklem Thema von Home Assistant. Vorgabe Automatisch.',
            icon_set: 'Busch zeichnet eigene Symbole, Material Design nutzt mdi-Symbole. Vorgabe Busch.',
            hidden_objects: 'Gewählte Kartenobjekte zeigt die Karte nicht, auf jedem Stockwerk. Vorgabe keine.',
            override_colors: 'Ersetzt einzelne Kartenfarben; leer bleibt die Farbe des Schemas.',
            map_config: 'Eigene Einstellungen für einzelne Stockwerke; sie gelten zusätzlich zu den Werten oben.',
            dark: 'Farben, die nur im dunklen Farbschema gelten. Vorgabe wie oben.',
            floor: 'Farbe der begehbaren Fläche ohne Raum. Vorgabe aus dem Farbschema.',
            wall: 'Farbe von Wänden und Raumkonturen. Vorgabe aus dem Farbschema.',
            room: 'Eine Farbe für alle Räume statt der vier Raumfarben. Vorgabe aus dem Farbschema.',
            carpet: 'Farbe, mit der Teppiche über dem Raum liegen. Vorgabe aus dem Farbschema.',
            no_go: 'Farbe der No-Go-Zonen. Vorgabe die Fehlerfarbe des Themas.',
            no_mop: 'Farbe der No-Mop-Zonen. Vorgabe die Infofarbe des Themas.',
            virtual_wall: 'Farbe virtueller Wände und nicht passierbarer Schwellen. Vorgabe die Fehlerfarbe des Themas.',
            path: 'Farbe des Reinigungspfads. Vorgabe aus dem Farbschema.',
            robot: 'Farbe des Roboters. Vorgabe die Hauptfarbe des Themas.',
            charger: 'Farbe der Station. Vorgabe die Erfolgsfarbe des Themas.',
            rotation: 'Dreht nur die Anzeige im Uhrzeigersinn, nicht die Karte des Roboters. Vorgabe 0°.',
            scale: 'Vergrößert oder verkleinert die eingepasste Karte, 0,25 bis 4. Vorgabe 1.',
            opacity: 'Deckkraft von Kartenbild oder Kartenfläche, 0 bis 1. Vorgabe 1.',
            object_scale: 'Größe von Roboter, Station und anderen Symbolen, 0,25 bis 4; der Zoom ändert sie nicht. Vorgabe 1.',
            object_opacity: 'Deckkraft aller eingezeichneten Objekte, 0 bis 1. Vorgabe 1.',
            font_size: 'Schriftgröße der Raumnamen in Pixeln, 6 bis 40. Vorgabe 12.',
            crop: 'Schneidet Ränder der Karte ab, in Prozent je Seite. Vorgabe kein Ausschnitt.',
            top: 'So viel Prozent schneidet die Karte oben ab. Vorgabe 0.',
            right: 'So viel Prozent schneidet die Karte rechts ab. Vorgabe 0.',
            bottom: 'So viel Prozent schneidet die Karte unten ab. Vorgabe 0.',
            left: 'So viel Prozent schneidet die Karte links ab. Vorgabe 0.',
            background_image: 'Eigenes Bild unter der Karte, etwa ein Grundriss; Ecken in Roboter-Millimetern aus der Karteninfo. Vorgabe keines.',
            overlay_image: 'Eigenes Bild über der Karte, unter den Symbolen; Ecken wie beim Hintergrundbild. Vorgabe keines.',
            url: 'Adresse des Bilds, etwa /local/grundriss.png. Vorgabe leer.',
            x0: 'Linke Bildkante in Roboter-Millimetern. Vorgabe leer.',
            y0: 'Untere Bildkante in Roboter-Millimetern. Vorgabe leer.',
            x1: 'Rechte Bildkante in Roboter-Millimetern. Vorgabe leer.',
            y1: 'Obere Bildkante in Roboter-Millimetern. Vorgabe leer.'
        },
        texte: {
            fehlerKeineEntitaet: 'Bitte einen Saugroboter (vacuum.*) als Entität wählen.',
            fehlerFalscheDomain: '„{entity}“ ist kein Saugroboter (vacuum.*).',
            keinFormular: 'Der Editor von Home Assistant ist noch nicht geladen.',
            flaeche: 'Fläche',
            zeit: 'Zeit',
            akku: 'Akku',
            akkuLaedt: 'lädt',
            akkuNiedrig: 'niedrig',
            akkuPause: 'lädt zum Fortsetzen',
            start: 'Reinigen',
            pause: 'Pause',
            resume: 'Fortsetzen',
            stop: 'Stopp',
            return: 'Zurück',
            zurueckZumDock: 'Zurück zum Dock',
            station: 'Station',
            frischwasserFehlt: 'Frischwassertank fehlt',
            frischwasserNiedrig: 'Frischwasser niedrig',
            schmutzwasser: 'Schmutzwassertank fehlt oder voll',
            staubbeutelFehlt: 'Staubbeutel fehlt',
            staubbeutelPruefen: 'Staubbeutel prüfen',
            reinigungsmittelNiedrig: 'Reinigungsmittel niedrig',
            ablaufFehler: 'Entwässerung fehlgeschlagen',
            aufgabenart: 'Aufgabenart',
            taskAll: 'Gesamt',
            taskRoom: 'Raum',
            taskZone: 'Zone',
            taskSpot: 'Spot',
            taskGoto: 'Hinfahren',
            aufgabeLaeuft: 'Aufgabe läuft',
            wiederholungen: 'Wiederholungen',
            wiederholungenWert: 'Wiederholungen: {n}×',
            wenigerWiederholungen: 'Weniger Wiederholungen',
            mehrWiederholungen: 'Mehr Wiederholungen',
            gotoSimuliert: 'Dieser Roboter fährt Ziele als kleine Zonenreinigung an: Die Integration stellt Modus, Saugstufe und Wasser dafür kurz um und danach zurück.',
            zielMitte: 'Ziel in Kartenmitte',
            zielpunkte: 'Gespeicherte Zielpunkte',
            zielpunktName: 'Zielpunkt {n}',
            zielName: 'Ziel · {x} / {y} mm',
            zielVerschieben: 'Ziel verschieben',
            zielblase: 'Ziel',
            zielVerwerfen: 'Ziel verwerfen',
            hierhinFahren: 'Hierhin fahren',
            tastenZiel: 'Tasten am Ziel: Pfeile verschieben (Umschalt: 500 mm), Eingabe springt zu „Hierhin fahren“, Entf verwirft.',
            spotHier: 'Spot hier',
            punkte: 'Punkte',
            punktName: 'Punkt {n} · 1,5 × 1,5 m',
            punktBearbeiten: 'Punkt {n} verschieben',
            punktAmRoboter: 'Punkt an Roboterposition',
            tastenPunkt: 'Tasten am Punkt: Pfeile verschieben (Umschalt: 500 mm), Entf entfernt, Escape hebt die Wahl auf.',
            bereiche: 'Bereiche',
            bereichName: 'Bereich {n} · {w} × {h} m',
            bereichBearbeiten: 'Bereich {n} bearbeiten',
            bereichHinzufuegen: 'Bereich hinzufügen',
            ausserhalb: 'außerhalb',
            nach_left: 'Nach links (mit Umschalt 500 mm)',
            nach_right: 'Nach rechts (mit Umschalt 500 mm)',
            nach_up: 'Nach oben (mit Umschalt 500 mm)',
            nach_down: 'Nach unten (mit Umschalt 500 mm)',
            schmaler: 'Breite −',
            breiter: 'Breite +',
            niedriger: 'Höhe −',
            hoeher: 'Höhe +',
            entfernen: 'Entfernen',
            tastenBereich: 'Tasten am Bereich: Pfeile verschieben (Umschalt: 500 mm), Alt+Pfeile ändern die Größe, Entf entfernt, Escape hebt die Wahl auf.',
            cleanGeniusAus: 'CleanGenius ist an: Für diese Aufgabe schaltet die Integration CleanGenius kurz aus und danach wieder an.',
            raumGewaehlt: '{n} Raum gewählt',
            raeumeGewaehlt: '{n} Räume gewählt',
            alleWaehlen: 'Alle wählen',
            auswahlLeeren: 'Auswahl leeren',
            auswahlGeleert: 'Auswahl geleert.',
            rueckgaengig: 'Rückgängig',
            reihenfolgeGespeichert: 'Der Roboter reinigt in seiner gespeicherten Reinigungsreihenfolge (Menü → Reinigungsreihenfolge), nicht in der Tipp-Reihenfolge.',
            auswahlKarteGewechselt: 'Karte gewechselt: Die Auswahl gehörte zur vorigen Karte und wurde geleert. Wähle neu.',
            aufgabeFehler: '„{task}“ wurde nicht gestartet ({grund}). Deine Auswahl bleibt erhalten. Prüfe den Grund und starte erneut; hilft das nicht, prüfe die Integration dreame_vacuum.',
            sperreAblassenAufgabe: 'Während die Station Wasser ablässt oder sich selbst repariert, startet keine Aufgabe. Warte, bis sie fertig ist.',
            raumOhneKarte: 'Räume lassen sich nur auf einer gespeicherten Karte reinigen. Lass den Roboter die Karte fertig erstellen und speichern, oder wähle „Gesamt“.',
            leerRaum: 'Noch kein Raum gewählt. Tippe einen Raum auf der Karte oder einen Raum-Knopf an.',
            leerZone: 'Noch kein Bereich. Tippe auf die Karte, ziehe ein Rechteck oder nutze „Bereich hinzufügen“.',
            leerSpot: 'Noch kein Punkt. Tippe auf die Karte oder nutze „Punkt an Roboterposition“.',
            leerGoto: 'Noch kein Ziel. Tippe auf die Karte oder wähle einen gespeicherten Zielpunkt.',
            zoneZuKlein: 'Ein Bereich ist zu klein: jede Seite muss länger als {min} sein. Vergrößere ihn mit den Griffen oder „Breite +“/„Höhe +“.',
            zoneAusserhalb: 'Ein Bereich liegt ganz außerhalb der befahrbaren Fläche. Verschiebe ihn auf den Boden oder entferne ihn.',
            punktAusserhalb: 'Der Punkt liegt nicht auf befahrbarer Fläche. Wähle einen Punkt auf dem Boden der Karte.',
            gotoAmRoboter: 'Der Roboter steht schon an diesem Ziel. Wähle einen Punkt weiter weg.',
            aufgabeGeplant: 'Geplante Aufgabe',
            aufgabeShortcut: 'Shortcut-Aufgabe',
            stufeError: 'Fehler',
            stufeWarning: 'Warnung',
            stufeInfo: 'Hinweis',
            stufeLowWater: 'Wassermangel',
            infoPausiert: 'Reinigung unterbrochen: lädt und setzt danach fort.',
            warnungLoeschen: 'Warnung löschen',
            ausblenden: 'Ausblenden',
            fortschritt: 'Fortschritt {wert} %',
            menu: 'Menü',
            schliessen: 'Schließen',
            zurueck: 'Zurück',
            entryLocate: 'Orten',
            entryHistory: 'Reinigungsverlauf',
            entryCruising: 'Cruising-Verlauf',
            entryConsumables: 'Zubehör',
            entrySequence: 'Reinigungsreihenfolge',
            entryRemote: 'Fernsteuerung',
            remoteWarnung: 'Rückwärts fährt ohne Kollisionsschutz. Loslassen hält sofort an.',
            remoteStarten: 'Steuerung starten',
            remoteStopp: 'Stopp',
            remoteStatus_unarmed: 'Nicht freigegeben — erst „Steuerung starten“, dann bewegen Regler und Tasten den Roboter.',
            remoteStatus_ready: 'Bereit — Regler halten oder Taste drücken.',
            remoteStatus_moving: 'Fährt — Loslassen hält an.',
            remoteStatus_stopping: 'Hält an …',
            remoteStatus_stopped: 'Gestoppt.',
            remoteStatus_blocked: 'Gesperrt.',
            remoteGesperrt_washing: 'Gesperrt: Die Station wäscht gerade den Mopp.',
            remoteGesperrt_mapping: 'Gesperrt: Die Schnellkartierung läuft.',
            remoteGesperrt_error: 'Gesperrt: Der Roboter meldet einen Fehler.',
            remoteGesperrt_unavailable: 'Gesperrt: Der Roboter ist nicht verfügbar.',
            remoteGesperrt_connection: 'Gesperrt: keine Verbindung zu Home Assistant.',
            remoteFehler: 'Gestoppt nach einem Fehler: {grund}. Zum Weiterfahren Steuerung neu starten.',
            remoteZeit: 'keine Antwort innerhalb von 2 s',
            remoteVerbindung: 'Verbindung zu Home Assistant verloren — der Stopp kam vielleicht nicht an. Roboter mit der Taste am Gerät oder in der Dreame-App anhalten; danach Steuerung neu starten.',
            entryMaps: 'Kartenverwaltung',
            entrySettings: 'Geräteeinstellungen',
            zubehoerNiedrig: '{n} unter 30 %',
            platzhalter: 'Diese Ansicht kommt mit einem späteren Ausbau der Karte (Modul „{modul}“).',
            gesperrt: 'Karte gesperrt – zum Entsperren halten',
            entsperrt: 'Karte entsperrt – zum Sperren halten',
            lock_auto: 'Automatisch',
            lock_only_touch: 'Nur am Touchgerät',
            lock_never: 'Nie',
            lock_always: 'Immer',
            obj_title: 'Titel',
            obj_state: 'Statuszeile',
            obj_menu: 'Menü',
            obj_status: 'Statuswerte',
            obj_task_type: 'Aufgabenwahl',
            obj_controls: 'Steuerleiste',
            obj_action_buttons: 'Aktionsknöpfe',
            obj_animations: 'Animationen',
            obj_shortcuts: 'Shortcuts',
            obj_cruising_history: 'Cruising-Verlauf',
            obj_error_message: 'Fehlermeldungen',
            obj_warning_message: 'Warnungen',
            obj_info_message: 'Hinweise',
            obj_low_water_message: 'Wassermangel',
            obj_map_change_confirmation: 'Bestätigung beim Kartenwechsel',
            obj_progress_bar: 'Fortschrittsbalken',
            obj_dock_status_indicator: 'Stationsanzeige',
            kartenWechselTitel: 'Karte wechseln',
            kartenWechselFrage: 'Zur Karte „{karte}“ wechseln? Der Roboter arbeitet danach mit dieser Karte.',
            wechseln: 'Wechseln',
            abbrechen: 'Abbrechen',
            display_standard: 'Standard',
            display_floor_plan: 'Grundriss',
            scheme_auto: 'Automatisch',
            scheme_light: 'Hell',
            scheme_dark: 'Dunkel',
            scheme_grey: 'Grau',
            icons_busch: 'Busch',
            icons_material: 'Material Design',
            stockwerkLabel: 'Stockwerk {name}',
            stockwerkHelfer: 'Einstellungen nur für dieses Stockwerk; leere Werte gelten wie für die ganze Karte.',
            mapobj_rooms: 'Raumnamen',
            mapobj_cleaning_settings: 'Raumeinstellungen',
            mapobj_blocked_rooms: 'Gesperrte Räume',
            mapobj_robot: 'Roboter',
            mapobj_charger: 'Station',
            mapobj_station_status: 'Stationsstatus',
            mapobj_router: 'Router',
            mapobj_path: 'Reinigungspfad',
            mapobj_carpets: 'Teppiche',
            mapobj_detected_carpets: 'Erkannte Teppiche',
            mapobj_deleted_carpets: 'Gelöschte Teppiche',
            mapobj_furnitures: 'Möbel',
            mapobj_no_go_areas: 'No-Go-Zonen',
            mapobj_no_mopping_areas: 'No-Mop-Zonen',
            mapobj_virtual_walls: 'Virtuelle Wände',
            mapobj_passable_thresholds: 'Passierbare Schwellen',
            mapobj_impassable_thresholds: 'Unpassierbare Schwellen',
            mapobj_ramps: 'Rampen',
            mapobj_curtains: 'Vorhänge',
            mapobj_predefined_points: 'Zielpunkte',
            mapobj_obstacles: 'Hindernisse',
            mapobj_stains: 'Flecken',
            mapobj_pets: 'Haustiere',
            karte: 'Karte',
            karteAlt: 'Karte „{karte}“ des Saugroboters',
            karteLaedt: 'Karte lädt …',
            karteLeer: 'Noch keine gespeicherte Karte. Sobald der Roboter eine Karte erstellt hat, erscheint sie hier; bis dahin geht die Reinigung „Gesamt“.',
            kameraWeg: 'Die Kartenkamera ist nicht verfügbar, deshalb fehlt die Karte. Steuerung und Status gehen weiter. Prüfe die Integration dreame_vacuum oder warte, bis die Kamera wieder da ist.',
            bildFehler: 'Das Kartenbild ließ sich nicht laden. Steuerung und Status gehen weiter. Versuche es erneut.',
            erneutLaden: 'Erneut laden',
            temporaereKarte: 'Temporäre Karte: noch nicht gespeichert.',
            kartierungLaeuft: 'Kartierung läuft – die Karte wächst mit.',
            ohneKalibrierung: 'Die Karte hat noch keine Kalibrierung: Roboter, Station und Räume lassen sich nicht einzeichnen.',
            zoomIn: 'Vergrößern',
            zoomOut: 'Verkleinern',
            zoomFit: 'Einpassen',
            zoomGesperrt: 'Karte gesperrt – das Schloss oben halten, um Zoomen und Verschieben freizugeben.',
            raeume: 'Räume',
            raumPosition: '{name}, Position {n}',
            hindernis: 'Hindernis',
            hindernisTyp: 'Art',
            hindernisRaum: 'Raum',
            hindernisGrund: 'Grund',
            hindernisStatus: 'Status',
            details: 'Details',
            fotoAlt: 'Foto des Hindernisses',
            fotoFehlt: 'Für dieses Hindernis gibt es kein Foto.',
            fotoLaedt: 'Das Foto wird noch hochgeladen.',
            fotoLaden: 'Foto herunterladen',
            ignorieren: 'Ignorieren',
            nichtIgnorieren: 'Nicht mehr ignorieren',
            ignoriert: 'ignoriert',
            nichtIgnoriert: 'beachtet',
            ignorierenGesperrt: 'Während einer Aufgabe lässt sich ein Hindernis nicht ignorieren.',
            autoIgnoriert: 'Der Roboter ignoriert dieses Hindernis selbst; das lässt sich nicht ändern.',
            hindernisWeg: 'Das Hindernis ist auf der aktuellen Karte nicht mehr vorhanden.',
            karteninfo: 'Karteninfo',
            rohgroesse: 'Rohgröße',
            kalibrierung: 'Kalibrierung',
            massstab: 'Maßstab',
            ursprung: 'Ursprung',
            rotationGeraet: 'Drehung Gerät',
            rotationAnzeige: 'Drehung Anzeige',
            modus: 'Modus',
            modusDaten: 'Kartendaten (exakt)',
            modusBild: 'Kartenbild',
            zellen: '{w} × {h} Zellen à {g} mm',
            koordinateWaehlen: 'Koordinate wählen',
            koordinateHinweis: 'Tippe auf die Karte, um eine Koordinate zu wählen.',
            koordinate: 'Koordinate',
            darunter: 'Darunter',
            kopieren: 'Kopieren',
            boden: 'Boden',
            ausserhalb: 'außerhalb der Karte',
            waehlenGesperrt: 'Die Karte ist gesperrt; zum Wählen erst das Schloss halten.',
            stockwerkWaehlen: 'Stockwerk wählen',
            stockwerkGesperrt: 'Aufgabe läuft – das Stockwerk lässt sich erst danach wechseln.',
            aktiveKarte: 'aktiv',
            an: 'An',
            aus: 'Aus',
            speichert: 'Speichert …',
            wertUnbekannt: 'Wert unbekannt',
            aenderung: 'Änderung',
            nichtUebernommen: '{name}: Das Gerät hat die Änderung nicht übernommen. Der bisherige Wert gilt weiter. Versuche es erneut.',
            schreibFehler: '{name} wurde nicht geändert ({grund}). Der bisherige Wert gilt weiter. Versuche es erneut; hilft das nicht, prüfe die Integration dreame_vacuum.',
            bereich: 'Erlaubt sind Werte von {min} bis {max}.',
            sperre_idle: 'Während einer Aufgabe nicht änderbar.',
            sperre_ai: 'Erst die KI-Hinderniserkennung einschalten.',
            sperre_fluid: 'Erst die Flüssigkeitserkennung einschalten.',
            sperre_carpet: 'Nur bei eingeschalteter Teppicherkennung und ausgeschaltetem Teppich-Meiden.',
            sperre_dnd: 'Nur bei aktivem „Nicht stören“.',
            sperre_manualLight: 'Die Helligkeit regelt gerade die Automatik.',
            sperre_liste: 'Die Integration erlaubt die Änderung gerade nicht.',
            ja: 'Ja',
            nein: 'Nein',
            aktWaschen: 'Mop waschen',
            aktWaschenPausieren: 'Waschen läuft · pausieren',
            aktWaschenFortsetzen: 'Waschen pausiert · fortsetzen',
            aktTrocknen: 'Trocknen starten',
            aktTrocknenStoppen: 'Trocknen läuft · stoppen',
            aktBeutel: 'Staubbeutel trocknen',
            aktEntleeren: 'Jetzt entleeren',
            aktAblassen: 'Wasser ablassen',
            aktTankLeeren: 'Wassertank leeren',
            aktStationReinigen: 'Station reinigen',
            aktSelbstreparatur: 'Selbstreparatur',
            aktNachreinigen: 'Nachreinigen',
            folge_drain: 'Die Station lässt ihr Wasser ab. Waschen und Wischen gehen erst wieder, wenn Wasser nachgefüllt ist.',
            folge_empty_tank: 'Der Frischwassertank wird geleert; das Wasser darin wird verworfen. Danach den Tank neu füllen.',
            folge_self_repair: 'Die Station prüft und repariert sich selbst. Das dauert einige Minuten; währenddessen wäscht und trocknet sie nicht.',
            folge_station_cleaning: 'Der Roboter verlässt das Dock, damit die Station sich reinigt. Er kehrt danach nicht immer selbst zurück; dann „Zurück zum Dock“ tippen.',
            folge_recleaning: 'Der Roboter verlässt das Dock und reinigt die zuletzt ausgelassenen oder schmutzigen Bereiche nach.',
            starten: 'Starten',
            wirdGestartet: 'Wird gestartet …',
            aktionFehler: '{name} wurde nicht gestartet ({grund}). An der Station hat sich nichts geändert. Prüfe Station und Roboter und versuche es erneut; hilft das nicht, prüfe die Integration dreame_vacuum.',
            stationEinstellungen: 'Station-Einstellungen',
            shortcuts: 'Shortcuts',
            skripte: 'Skripte',
            laeuft: 'läuft',
            skripteFehlen: 'Nicht gefunden: {liste}.',
            verwalten: 'Verwalten',
            shortcutsVerwalten: 'Shortcuts verwalten',
            keineShortcuts: 'Keine Shortcuts auf dem Gerät. Shortcuts legst du in der Dreame-App an; danach hier „Neu laden“.',
            neuLaden: 'Neu laden',
            umbenennen: 'Umbenennen',
            loeschenLaeuft: 'Läuft gerade — Löschen geht erst danach.',
            feld_shortcut_name: 'Name',
            nameFehlt: 'Bitte einen Namen eingeben.',
            nameNummer: 'Gibt es den Namen schon, hängt das Gerät eine Zahl an.',
            frageShortcutLoeschen: 'Shortcut „{name}“ löschen? Er verschwindet auch aus der Dreame-App.',
            shortcutZusaetzlich: 'Eine Aufgabe läuft — der Shortcut wird zusätzlich gestartet; was mit der laufenden Aufgabe geschieht, entscheidet der Roboter.',
            sperreAblassen: 'Während die Station Wasser ablässt, startet kein Shortcut. Warte, bis das Ablassen fertig ist.',
            shortcutFehler: '{name} wurde nicht gestartet ({grund}). Der Roboter macht weiter wie bisher. Versuche es erneut; hilft das nicht, prüfe die Integration dreame_vacuum.',
            stationStatus: 'Stationsstatus',
            alleWerte: 'Alle Stationswerte ({n})',
            reiter_wash: 'Waschen',
            reiter_dry: 'Trocknen',
            reiter_empty: 'Entleeren',
            wartung: 'Wartung',
            sperre_selfClean: 'Nur bei eingeschalteter Mop-Selbstreinigung.',
            sperre_smartWash: 'Nur bei ausgeschalteter intelligenter Mop-Wäsche; die wählt die Temperatur selbst.',
            sperre_cleanGenius: 'Während einer CleanGenius-Reinigung nicht änderbar.',
            sperre_notByTime: 'Nur wenn die Selbstreinigung nach Fläche oder Raum läuft, nicht nach Zeit.',
            sperre_byTime: 'Nur wenn die Selbstreinigung nach Zeit läuft.',
            sperre_notDrying: 'Während des Trocknens nicht änderbar.',
            sperre_autoDrying: 'Nur bei automatischem Trocknen ohne intelligentes Trocknen.',
            sperre_autoEmpty: 'Nur bei eingeschaltetem Auto-Entleeren.',
            sperre_customized: 'Customized Cleaning ist an: dieser Wert gilt je Raum.',
            sperre_customizedMode: 'Customized Cleaning ist an: dieser Wert gilt je Raum.',
            sperre_savedMap: 'Nur mit gespeicherter Karte, nicht mit einer temporären.',
            sperre_cleangeniusListe: 'CleanGenius geht gerade nicht: während einer Aufgabe, bei Zone/Spot oder ohne eingesetzten Mop.',
            einstellungen: 'Einstellungen',
            reinigungseinstellungen: 'Reinigungseinstellungen',
            abschnitt_cleangenius: 'CleanGenius',
            abschnitt_basic: 'Grundeinstellungen',
            abschnitt_customized: 'Customized Cleaning',
            abschnitt_sequence: 'Reinigungsreihenfolge',
            abschnitt_more: 'Mehr',
            weitereReinigung: 'Weitere Reinigungseinstellungen',
            wiederholungenHinweis: 'Gilt für Raum ohne Customized Cleaning, Zone und Spot.',
            cleanGeniusRaeume: 'CleanGenius wählt die Einstellungen je Raum selbst.',
            raeumeEinstellen: 'Räume einstellen',
            keineRaeume: 'Keine Räume auf der aktiven Karte.',
            durchgaenge: 'Durchgänge',
            raumUnvollstaendig: 'Ein Wert dieses Raums ist unbekannt; die Karte sendet nichts, statt zu raten.',
            aufAlleTitel: 'Auf alle Räume übertragen',
            aufAlleFrage: 'Die Werte von {raum} ersetzen die Werte dieser Räume: {raeume}.',
            aufAlleStand: '{n} von {gesamt} Räumen übertragen.',
            aufAlleFehler: 'Abgebrochen: {grund}. Schon geändert: {raeume}. Erneut versuchen, sobald der Roboter ruht.',
            uebertragen: 'Übertragen',
            abschnitt_unordered: 'Ohne Reihenfolge',
            raumPlatz: '{name}, Platz {n} von {gesamt}',
            raumGegriffen: '{name} gegriffen, Platz {n} von {gesamt}. Pfeile verschieben, Leertaste legt ab, Escape bricht ab.',
            raumVerschoben: '{name} auf Platz {n} von {gesamt}.',
            raumAbgelegt: '{name} abgelegt auf Platz {n}.',
            raumAbgebrochen: 'Verschieben abgebrochen, {name} wieder auf Platz {n}.',
            nachOben: '{name} nach oben',
            nachUnten: '{name} nach unten',
            anDenAnfang: '{name} an den Anfang',
            herausnehmen: '{name} aus der Reihenfolge nehmen',
            einreihen: '{name} hinten einreihen',
            einreihenKurz: 'Einreihen',
            antippen: 'Der Reihe nach antippen',
            antippenHinweis: 'Räume in der neuen Reihenfolge antippen; nicht getippte folgen in ihrer bisherigen Reihenfolge.',
            fertig: 'Fertig',
            reihenfolgeAus: 'Reihenfolge aus',
            reihenfolgeAusFolge: 'Ohne Reihenfolge nach dem Speichern: {raeume}.',
            reihenfolgeLeer: 'Keine eigene Reihenfolge: der Roboter wählt sie selbst.',
            status_washing: 'Mop wird gewaschen',
            status_washing_paused: 'Waschen pausiert',
            status_drying: 'Trocknet',
            status_draining_available: 'Ablassen möglich',
            status_washing_available: 'Waschen möglich',
            status_drying_available: 'Trocknen möglich',
            status_dust_collection_available: 'Entleeren möglich',
            gruppe_cleaning: 'Reinigung',
            gruppe_mopping: 'Wischen',
            gruppe_carpet: 'Teppich',
            gruppe_station: 'Station',
            gruppe_camera: 'Kamera und KI',
            gruppe_audio: 'Audio',
            gruppe_dnd: 'Nicht stören',
            gruppe_schedule: 'Zeitpläne',
            gruppe_battery: 'Akku',
            gruppe_consumables: 'Zubehör',
            gruppe_info: 'Geräteinfo',
            gruppe_other: 'Sonstiges',
            set_custom_mopping_mode: 'Eigener Wischmodus',
            sucheLabel: 'Einstellungen durchsuchen',
            stationWaschen: 'Station: Waschen, Wassertemperatur, Waschfrequenz',
            sprachpaket: 'Sprachpaket',
            sprachpaketTitel: 'Sprachpaket installieren',
            sprachpaketHinweis: 'Die Integration bringt keinen Katalog mit: Adresse, MD5-Prüfsumme und Größe des Pakets müssen aus einer vertrauenswürdigen Quelle stammen. Alle Felder sind Pflichtfelder.',
            feld_lang_id: 'Sprach-ID',
            feld_url: 'Adresse des Pakets (URL)',
            feld_md5: 'MD5-Prüfsumme',
            feld_size: 'Größe in Bytes',
            fehlerSprachId: 'Pflichtfeld: Buchstaben, Ziffern, - oder _ (z. B. DE).',
            fehlerUrl: 'Pflichtfeld: vollständige Adresse mit http:// oder https://, ohne Leer- und Anführungszeichen.',
            fehlerMd5: 'Pflichtfeld: genau 32 Zeichen aus 0–9 und a–f.',
            fehlerGroesse: 'Pflichtfeld: ganze Zahl über 0.',
            weiter: 'Weiter',
            installieren: 'Installieren',
            sprachpaketFrageTitel: 'Sprachpaket installieren?',
            sprachpaketFrage: 'Paket „{id}“ ({groesse} Bytes) von {url} installieren? Der Roboter lädt es herunter und ersetzt damit seine Sprachausgabe.',
            sprachpaketGesendet: 'Installation von „{id}“ angefragt. Sobald das Gerät fertig ist, zeigt „Sprachpaket“ die neue ID.',
            eingabenBleiben: 'Deine Eingaben bleiben erhalten.',
            taeglich: 'Täglich',
            bestaetigenTitel: '{name} ändern?',
            rest: 'Noch {prozent} · {zeit}',
            zuruecksetzen: 'Zurücksetzen',
            zuruecksetzenVon: '{name} zurücksetzen',
            zuruecksetzenTitel: '{name} zurücksetzen?',
            zuruecksetzenFrage: '{name} zurücksetzen? Aktuell noch {prozent}; danach zählt das Gerät wieder ab 100 %. Nur nach dem Tausch oder der Reinigung des Teils.',
            schonVoll: 'Steht schon auf 100 %.',
            summen: 'Summen',
            planHinweis: 'Die Integration liefert Zeitpläne nur ausgewertet. Beim Speichern schreibt die Karte alle Zeitpläne neu aus diesen Werten; Zusatzangaben der Dreame-App, die die Integration nicht weitergibt, gehen dabei verloren.',
            keinePlaene: 'Keine Zeitpläne. Lege den ersten in der Dreame-App an; danach lassen sich hier weitere mit dessen Reinigungseinstellungen anlegen.',
            planNeu: 'Zeitplan hinzufügen',
            planBearbeiten: 'Zeitplan bearbeiten',
            zeitplan: 'Zeitplan',
            ungueltig: 'Ungültig',
            karteNr: 'Karte {id}',
            planReinigung: '{karte} · Saugstufe {saugen} · Wasser {wasser}',
            feld_time: 'Uhrzeit',
            feld_days_plan: 'Tage (keiner = einmalig)',
            planLoeschenTitel: 'Zeitplan löschen?',
            planLoeschenFrage: 'Zeitplan um {zeit} ({tage}) endgültig löschen?',
            hersteller: 'Hersteller',
            modell: 'Modell',
            firmware: 'Firmware',
            seriennummer: 'Seriennummer',
            wlan: 'WLAN',
            signal: 'Signal',
            zeitzone: 'Zeitzone',
            stationOk: 'in Ordnung',
            stoerungen: 'Störungen',
            keine: 'Keine',
            set_task_status: 'Aufgabenstatus',
            set_total_runtime: 'Gesamtlaufzeit',
            set_total_cruise_time: 'Gesamte Cruising-Zeit',
            set_track_cleaning_left: 'Spurreinigung',
            frage_map_rotation: 'Die gespeicherte Karte des Roboters auf {wert} drehen? Das ändert die Karte im Gerät, nicht nur die Anzeige.',
            aendern: 'Ändern',
            einmalig: 'Einmalig',
            zeitraum: 'Zeitraum',
            bearbeitenVon: '{name} bearbeiten',
            keineZeitraeume: 'Kein Zeitraum. Richte „Nicht stören“ einmal in der Dreame-App ein; danach änderst du Beginn und Ende hier.',
            zeitraumNeu: 'Zeitraum hinzufügen',
            zeitraumBearbeiten: 'Zeitraum bearbeiten',
            feld_start: 'Beginn',
            feld_end: 'Ende',
            fehlerZeit: 'Pflichtfeld: Uhrzeit im Format HH:MM.',
            fehlerGleich: 'Ende muss sich vom Beginn unterscheiden.',
            ungespeichert: 'Änderungen sind noch nicht gespeichert.',
            verwerfen: 'Verwerfen',
            speichern: 'Speichern',
            loeschen: 'Löschen',
            zeitraumLoeschenTitel: 'Zeitraum löschen?',
            zeitraumLoeschenFrage: 'Zeitraum {zeitraum} endgültig löschen?',
            treffer: '{n} Treffer',
            keineTreffer: 'Keine Einstellung gefunden. Versuche einen anderen Begriff.',
            dauerMin: '{m} min',
            dauerStdMin: '{h} h {m} min',
            laufFertig: 'Fertig',
            laufAuffaellig: 'Auffällig',
            laufUnterbrochen: 'Unterbrochen',
            einLauf: '1 Lauf',
            laeufe: '{n} Läufe',
            gruppeTitel: 'Reinigung + Nachreinigung',
            verlaufLeer: 'Kein Verlauf — die Integration lädt ihn nur mit Cloud-Verbindung.',
            raumNr: 'Raum {id}',
            verlaufDauer: 'Dauer',
            verlaufArt: 'Reinigungsart',
            verlaufKarte: 'Karte',
            verlaufFlaeche: 'Fläche',
            verlaufSaugstufe: 'Saugstufe',
            verlaufMop: 'Mopp',
            verlaufTank: 'Wassertank',
            verlaufStart: 'Startmethode',
            verlaufEntleert: 'Entleerungen',
            verlaufGewaschen: 'Mopp-Wäschen',
            verlaufGrund: 'Unterbrechungsgrund',
            verlaufHaustier: 'Haustier',
            laedtLauf: 'Daten des Laufs werden geladen …',
            keineLaufdaten: 'Keine Karte und keine Zusatzdaten für diesen Lauf.',
            laufFehler: 'Daten des Laufs konnten nicht geladen werden ({grund}).',
            erneut: 'Erneut',
            laufWeg: 'Diesen Lauf gibt es im Verlauf nicht mehr.',
            neuer: 'Neuer',
            aelter: 'Älter',
            blockierteRaeume: 'Blockierte Räume',
            laufKarte: 'Karte des Laufs',
            laufKarteAlt: 'Karte des Laufs vom {datum}',
            wlanKarteAlt: 'WLAN-Karte des Laufs vom {datum}',
            reinigungsKarte: 'Reinigungskarte',
            wlanKarte: 'WLAN-Karte',
            keineLaufKarte: 'Keine Karte für diesen Lauf.',
            keineWlanKarte: 'Keine WLAN-Karte für diesen Lauf.',
            laufHindernisse: 'Hindernisse',
            nachRaeume: 'Blockierte Räume zum Nachreinigen',
            nachWaehlen: 'Wähle mindestens einen Raum.',
            nachAufgabeLaeuft: 'Gesperrt, solange eine Aufgabe läuft.',
            nachLaedt: 'Wartet auf die Daten des Laufs.',
            nachOhneDaten: 'Ohne die Daten des Laufs lässt sich die Karte nicht prüfen.',
            nachAndereKarte: 'Gesperrt: dieser Lauf war auf einer anderen Karte als der aktuellen.',
            nachFrageAlle: 'Der Roboter verlässt das Dock und reinigt {raeume} nach.',
            nachFrageTeil: 'Der Roboter verlässt das Dock und reinigt {raeume} als neue Raumreinigung — im Verlauf erscheint ein neuer Lauf, keine Nachreinigung dieses Laufs.'
        }
    },
    en: {
        name: 'Busch vacuum',
        description: 'Status and control of a robot vacuum with everything the device can do, even without a map.',
        labels: {
            entity: 'Robot vacuum',
            title: 'Title',
            scripts: 'Scripts as shortcuts',
            layout_section: 'Layout',
            full_height: 'Full height',
            aspect_ratio: 'Aspect ratio',
            max_height_offset: 'Height offset',
            left_handed: 'Left-handed',
            operation_section: 'Operation',
            locked: 'Map lock',
            touch_lock: 'Hold time to unlock',
            disable_haptic: 'Vibration off',
            display_section: 'Display',
            hidden_card_objects: 'Hidden parts',
            map_section: 'Map',
            map_display: 'Map view',
            color_scheme: 'Colour scheme',
            icon_set: 'Icon set',
            hidden_objects: 'Hidden map objects',
            override_colors: 'Own colours',
            map_config: 'Per floor',
            dark: 'In the dark theme',
            floor: 'Floor',
            wall: 'Wall',
            room: 'Room',
            carpet: 'Carpet',
            no_go: 'No-go zone',
            no_mop: 'No-mop zone',
            virtual_wall: 'Virtual wall',
            path: 'Cleaning path',
            robot: 'Robot',
            charger: 'Station',
            rotation: 'Rotation',
            scale: 'Map size',
            opacity: 'Map opacity',
            object_scale: 'Icon size',
            object_opacity: 'Icon opacity',
            font_size: 'Font size',
            crop: 'Crop',
            top: 'Top',
            right: 'Right',
            bottom: 'Bottom',
            left: 'Left',
            background_image: 'Background image',
            overlay_image: 'Overlay image',
            url: 'Image address',
            x0: 'Left edge',
            y0: 'Bottom edge',
            x1: 'Right edge',
            y1: 'Top edge'
        },
        helpers: {
            entity: 'The robot vacuum this card shows; it finds the related entities through the device. Required, no default.',
            title: 'Card heading instead of the device name. Default empty, which shows the device name.',
            scripts: 'Scripts the shortcut menu offers ahead of the device shortcuts. Default none.',
            layout_section: 'Height and shape of the card and on which side the action buttons sit.',
            full_height: 'The card fills the visible height below the Home Assistant header. Default off.',
            aspect_ratio: 'Fixed shape such as 16:9, 4/3 or 1.5; ignored with full height and in a panel. Default empty.',
            max_height_offset: 'Pixels taken off the largest card height, for example for custom headers. Default 0.',
            left_handed: 'Puts the action buttons on the left and the station status on the right. Default off.',
            operation_section: 'Lock against moving the map by accident, and vibration on phones.',
            locked: 'When the map starts locked; Automatic locks on touch devices outside a panel view. Default Automatic.',
            touch_lock: 'How long you hold the lock to toggle it, 100 to 400 milliseconds. Default 200.',
            disable_haptic: 'Turns off the short vibration on taps on phones. Default off.',
            display_section: 'Which parts the card shows.',
            hidden_card_objects: 'The card does not show the chosen parts; without “Map change confirmation” it changes maps without asking. Default none.',
            map_section: 'How the live map looks: view, colours, icons and what it shows.',
            map_display: 'Standard shows rooms in their own colours, floor plan all rooms in one tone with outlines (map data only). Default Standard.',
            color_scheme: 'Map colours; Automatic follows the light or dark Home Assistant theme. Default Automatic.',
            icon_set: 'Busch draws its own icons, Material Design uses mdi icons. Default Busch.',
            hidden_objects: 'The map does not show the chosen objects, on every floor. Default none.',
            override_colors: 'Replaces single map colours; empty keeps the colour of the scheme.',
            map_config: 'Own settings for single floors; they apply on top of the values above.',
            dark: 'Colours that apply only in the dark colour scheme. Default as above.',
            floor: 'Colour of the reachable area outside rooms. Default from the colour scheme.',
            wall: 'Colour of walls and room outlines. Default from the colour scheme.',
            room: 'One colour for all rooms instead of the four room colours. Default from the colour scheme.',
            carpet: 'Colour carpets lay over the room. Default from the colour scheme.',
            no_go: 'Colour of no-go zones. Default the theme error colour.',
            no_mop: 'Colour of no-mop zones. Default the theme info colour.',
            virtual_wall: 'Colour of virtual walls and impassable thresholds. Default the theme error colour.',
            path: 'Colour of the cleaning path. Default from the colour scheme.',
            robot: 'Colour of the robot. Default the theme primary colour.',
            charger: 'Colour of the station. Default the theme success colour.',
            rotation: 'Turns only the display clockwise, not the robot map. Default 0°.',
            scale: 'Makes the fitted map larger or smaller, 0.25 to 4. Default 1.',
            opacity: 'Opacity of the map image or area, 0 to 1. Default 1.',
            object_scale: 'Size of robot, station and other icons, 0.25 to 4; zooming does not change it. Default 1.',
            object_opacity: 'Opacity of all drawn objects, 0 to 1. Default 1.',
            font_size: 'Font size of room names in pixels, 6 to 40. Default 12.',
            crop: 'Cuts off map edges, in percent per side. Default no crop.',
            top: 'Percent the map cuts off at the top. Default 0.',
            right: 'Percent the map cuts off on the right. Default 0.',
            bottom: 'Percent the map cuts off at the bottom. Default 0.',
            left: 'Percent the map cuts off on the left. Default 0.',
            background_image: 'Own picture below the map, such as a floor plan; corners in robot millimetres from the map info. Default none.',
            overlay_image: 'Own picture above the map, below the icons; corners as for the background image. Default none.',
            url: 'Address of the picture, such as /local/floorplan.png. Default empty.',
            x0: 'Left picture edge in robot millimetres. Default empty.',
            y0: 'Bottom picture edge in robot millimetres. Default empty.',
            x1: 'Right picture edge in robot millimetres. Default empty.',
            y1: 'Top picture edge in robot millimetres. Default empty.'
        },
        texte: {
            fehlerKeineEntitaet: 'Please choose a robot vacuum (vacuum.*) as entity.',
            fehlerFalscheDomain: '“{entity}” is not a robot vacuum (vacuum.*).',
            keinFormular: 'The Home Assistant editor has not loaded yet.',
            flaeche: 'Area',
            zeit: 'Time',
            akku: 'Battery',
            akkuLaedt: 'charging',
            akkuNiedrig: 'low',
            akkuPause: 'charging to resume',
            start: 'Clean',
            pause: 'Pause',
            resume: 'Resume',
            stop: 'Stop',
            return: 'Return',
            zurueckZumDock: 'Return to dock',
            station: 'Station',
            frischwasserFehlt: 'Clean water tank missing',
            frischwasserNiedrig: 'Clean water low',
            schmutzwasser: 'Dirty water tank missing or full',
            staubbeutelFehlt: 'Dust bag missing',
            staubbeutelPruefen: 'Check dust bag',
            reinigungsmittelNiedrig: 'Detergent low',
            ablaufFehler: 'Draining failed',
            aufgabenart: 'Task type',
            taskAll: 'All',
            taskRoom: 'Room',
            taskZone: 'Zone',
            taskSpot: 'Spot',
            taskGoto: 'Go to',
            aufgabeLaeuft: 'Task running',
            wiederholungen: 'Repeats',
            wiederholungenWert: 'Repeats: {n}×',
            wenigerWiederholungen: 'Fewer repeats',
            mehrWiederholungen: 'More repeats',
            gotoSimuliert: 'This robot reaches targets as a small zone cleaning: the integration briefly switches mode, suction and water and restores them afterwards.',
            zielMitte: 'Target at map centre',
            zielpunkte: 'Saved target points',
            zielpunktName: 'Target point {n}',
            zielName: 'Target · {x} / {y} mm',
            zielVerschieben: 'Move target',
            zielblase: 'Target',
            zielVerwerfen: 'Discard target',
            hierhinFahren: 'Go here',
            tastenZiel: 'Keys on the target: arrows move (Shift: 500 mm), Enter goes to “Go here”, Delete discards.',
            spotHier: 'Spot here',
            punkte: 'Points',
            punktName: 'Point {n} · 1.5 × 1.5 m',
            punktBearbeiten: 'Move point {n}',
            punktAmRoboter: 'Point at robot position',
            tastenPunkt: 'Keys on a point: arrows move (Shift: 500 mm), Delete removes, Escape deselects.',
            bereiche: 'Areas',
            bereichName: 'Area {n} · {w} × {h} m',
            bereichBearbeiten: 'Edit area {n}',
            bereichHinzufuegen: 'Add area',
            ausserhalb: 'outside',
            nach_left: 'Left (Shift: 500 mm)',
            nach_right: 'Right (Shift: 500 mm)',
            nach_up: 'Up (Shift: 500 mm)',
            nach_down: 'Down (Shift: 500 mm)',
            schmaler: 'Width −',
            breiter: 'Width +',
            niedriger: 'Height −',
            hoeher: 'Height +',
            entfernen: 'Remove',
            tastenBereich: 'Keys on an area: arrows move (Shift: 500 mm), Alt+arrows resize, Delete removes, Escape deselects.',
            cleanGeniusAus: 'CleanGenius is on: for this task the integration switches CleanGenius off and back on afterwards.',
            raumGewaehlt: '{n} room chosen',
            raeumeGewaehlt: '{n} rooms chosen',
            alleWaehlen: 'Select all',
            auswahlLeeren: 'Clear selection',
            auswahlGeleert: 'Selection cleared.',
            rueckgaengig: 'Undo',
            reihenfolgeGespeichert: 'The robot cleans in its saved cleaning sequence (menu → Cleaning sequence), not in the order you tapped.',
            auswahlKarteGewechselt: 'Map changed: the selection belonged to the previous map and was cleared. Choose again.',
            aufgabeFehler: '“{task}” did not start ({grund}). Your selection is kept. Check the reason and start again; if that does not help, check the dreame_vacuum integration.',
            sperreAblassenAufgabe: 'No task starts while the station drains water or repairs itself. Wait until it has finished.',
            raumOhneKarte: 'Rooms can only be cleaned on a saved map. Let the robot finish and save the map, or choose “All”.',
            leerRaum: 'No room chosen yet. Tap a room on the map or a room button.',
            leerZone: 'No area yet. Tap the map, drag a rectangle or use “Add area”.',
            leerSpot: 'No point yet. Tap the map or use “Point at robot position”.',
            leerGoto: 'No target yet. Tap the map or choose a saved point.',
            zoneZuKlein: 'An area is too small: each side must be longer than {min}. Enlarge it with the handles or “Width +”/“Height +”.',
            zoneAusserhalb: 'An area lies completely outside the reachable floor. Move it onto the floor or remove it.',
            punktAusserhalb: 'The point is not on reachable floor. Choose a point on the floor of the map.',
            gotoAmRoboter: 'The robot is already at this target. Choose a point further away.',
            aufgabeGeplant: 'Scheduled task',
            aufgabeShortcut: 'Shortcut task',
            stufeError: 'Error',
            stufeWarning: 'Warning',
            stufeInfo: 'Info',
            stufeLowWater: 'Low water',
            infoPausiert: 'Cleaning interrupted: charging, then it resumes.',
            warnungLoeschen: 'Clear warning',
            ausblenden: 'Dismiss',
            fortschritt: 'Progress {wert} %',
            menu: 'Menu',
            schliessen: 'Close',
            zurueck: 'Back',
            entryLocate: 'Locate',
            entryHistory: 'Cleaning history',
            entryCruising: 'Cruising history',
            entryConsumables: 'Accessories',
            entrySequence: 'Cleaning sequence',
            entryRemote: 'Remote control',
            remoteWarnung: 'Reversing has no collision guard. Letting go stops at once.',
            remoteStarten: 'Start control',
            remoteStopp: 'Stop',
            remoteStatus_unarmed: 'Not armed — tap “Start control” first, then sticks and keys move the robot.',
            remoteStatus_ready: 'Ready — hold a stick or press a key.',
            remoteStatus_moving: 'Moving — let go to stop.',
            remoteStatus_stopping: 'Stopping …',
            remoteStatus_stopped: 'Stopped.',
            remoteStatus_blocked: 'Locked.',
            remoteGesperrt_washing: 'Locked: the station is washing the mop.',
            remoteGesperrt_mapping: 'Locked: fast mapping is running.',
            remoteGesperrt_error: 'Locked: the robot reports an error.',
            remoteGesperrt_unavailable: 'Locked: the robot is unavailable.',
            remoteGesperrt_connection: 'Locked: no connection to Home Assistant.',
            remoteFehler: 'Stopped after an error: {grund}. Start control again to go on.',
            remoteZeit: 'no answer within 2 s',
            remoteVerbindung: 'Connection to Home Assistant lost — the stop may not have arrived. Stop the robot with its button or in the Dreame app; then start control again.',
            entryMaps: 'Map management',
            entrySettings: 'Device settings',
            zubehoerNiedrig: '{n} below 30 %',
            platzhalter: 'This view comes with a later update of the card (module “{modul}”).',
            gesperrt: 'Map locked – hold to unlock',
            entsperrt: 'Map unlocked – hold to lock',
            lock_auto: 'Automatic',
            lock_only_touch: 'Touch devices only',
            lock_never: 'Never',
            lock_always: 'Always',
            obj_title: 'Title',
            obj_state: 'Status line',
            obj_menu: 'Menu',
            obj_status: 'Status values',
            obj_task_type: 'Task type',
            obj_controls: 'Control bar',
            obj_action_buttons: 'Action buttons',
            obj_animations: 'Animations',
            obj_shortcuts: 'Shortcuts',
            obj_cruising_history: 'Cruising history',
            obj_error_message: 'Errors',
            obj_warning_message: 'Warnings',
            obj_info_message: 'Info messages',
            obj_low_water_message: 'Low water',
            obj_map_change_confirmation: 'Map change confirmation',
            obj_progress_bar: 'Progress bar',
            obj_dock_status_indicator: 'Station status',
            kartenWechselTitel: 'Change map',
            kartenWechselFrage: 'Change to the map “{karte}”? The robot then works with this map.',
            wechseln: 'Change',
            abbrechen: 'Cancel',
            display_standard: 'Standard',
            display_floor_plan: 'Floor plan',
            scheme_auto: 'Automatic',
            scheme_light: 'Light',
            scheme_dark: 'Dark',
            scheme_grey: 'Grey',
            icons_busch: 'Busch',
            icons_material: 'Material Design',
            stockwerkLabel: 'Floor {name}',
            stockwerkHelfer: 'Settings for this floor only; empty values apply as for the whole map.',
            mapobj_rooms: 'Room names',
            mapobj_cleaning_settings: 'Room settings',
            mapobj_blocked_rooms: 'Blocked rooms',
            mapobj_robot: 'Robot',
            mapobj_charger: 'Station',
            mapobj_station_status: 'Station status',
            mapobj_router: 'Router',
            mapobj_path: 'Cleaning path',
            mapobj_carpets: 'Carpets',
            mapobj_detected_carpets: 'Detected carpets',
            mapobj_deleted_carpets: 'Deleted carpets',
            mapobj_furnitures: 'Furniture',
            mapobj_no_go_areas: 'No-go zones',
            mapobj_no_mopping_areas: 'No-mop zones',
            mapobj_virtual_walls: 'Virtual walls',
            mapobj_passable_thresholds: 'Passable thresholds',
            mapobj_impassable_thresholds: 'Impassable thresholds',
            mapobj_ramps: 'Ramps',
            mapobj_curtains: 'Curtains',
            mapobj_predefined_points: 'Target points',
            mapobj_obstacles: 'Obstacles',
            mapobj_stains: 'Stains',
            mapobj_pets: 'Pets',
            karte: 'Map',
            karteAlt: 'Map “{karte}” of the robot vacuum',
            karteLaedt: 'Map loading …',
            karteLeer: 'No saved map yet. Once the robot has created a map it shows here; until then cleaning “All” works.',
            kameraWeg: 'The map camera is unavailable, so the map is missing. Controls and status keep working. Check the dreame_vacuum integration or wait until the camera is back.',
            bildFehler: 'The map image could not be loaded. Controls and status keep working. Try again.',
            erneutLaden: 'Load again',
            temporaereKarte: 'Temporary map: not saved yet.',
            kartierungLaeuft: 'Mapping in progress – the map grows along.',
            ohneKalibrierung: 'The map has no calibration yet: robot, station and rooms cannot be drawn.',
            zoomIn: 'Zoom in',
            zoomOut: 'Zoom out',
            zoomFit: 'Fit',
            zoomGesperrt: 'Map locked – hold the lock at the top to allow zooming and moving.',
            raeume: 'Rooms',
            raumPosition: '{name}, position {n}',
            hindernis: 'Obstacle',
            hindernisTyp: 'Type',
            hindernisRaum: 'Room',
            hindernisGrund: 'Reason',
            hindernisStatus: 'Status',
            details: 'Details',
            fotoAlt: 'Photo of the obstacle',
            fotoFehlt: 'There is no photo of this obstacle.',
            fotoLaedt: 'The photo is still uploading.',
            fotoLaden: 'Download photo',
            ignorieren: 'Ignore',
            nichtIgnorieren: 'Stop ignoring',
            ignoriert: 'ignored',
            nichtIgnoriert: 'considered',
            ignorierenGesperrt: 'An obstacle cannot be ignored while a task runs.',
            autoIgnoriert: 'The robot ignores this obstacle by itself; this cannot be changed.',
            hindernisWeg: 'The obstacle is no longer on the current map.',
            karteninfo: 'Map info',
            rohgroesse: 'Raw size',
            kalibrierung: 'Calibration',
            massstab: 'Scale',
            ursprung: 'Origin',
            rotationGeraet: 'Device rotation',
            rotationAnzeige: 'Display rotation',
            modus: 'Mode',
            modusDaten: 'Map data (exact)',
            modusBild: 'Map image',
            zellen: '{w} × {h} cells of {g} mm',
            koordinateWaehlen: 'Pick coordinate',
            koordinateHinweis: 'Tap the map to pick a coordinate.',
            koordinate: 'Coordinate',
            darunter: 'Below',
            kopieren: 'Copy',
            boden: 'Floor',
            ausserhalb: 'outside the map',
            waehlenGesperrt: 'The map is locked; hold the lock first to pick.',
            stockwerkWaehlen: 'Choose floor',
            stockwerkGesperrt: 'Task running – the floor can be changed afterwards.',
            aktiveKarte: 'active',
            an: 'On',
            aus: 'Off',
            speichert: 'Saving …',
            wertUnbekannt: 'Value unknown',
            aenderung: 'Change',
            nichtUebernommen: '{name}: The device did not take the change. The previous value still applies. Try again.',
            schreibFehler: '{name} was not changed ({grund}). The previous value still applies. Try again; if that does not help, check the dreame_vacuum integration.',
            bereich: 'Allowed values are {min} to {max}.',
            sperre_idle: 'Cannot change during a task.',
            sperre_ai: 'Turn on AI obstacle detection first.',
            sperre_fluid: 'Turn on fluid detection first.',
            sperre_carpet: 'Only with carpet recognition on and carpet avoidance off.',
            sperre_dnd: 'Only while “Do not disturb” is active.',
            sperre_manualLight: 'Brightness is currently set automatically.',
            sperre_liste: 'The integration does not allow this change right now.',
            ja: 'Yes',
            nein: 'No',
            aktWaschen: 'Wash mop',
            aktWaschenPausieren: 'Washing · pause',
            aktWaschenFortsetzen: 'Washing paused · resume',
            aktTrocknen: 'Start drying',
            aktTrocknenStoppen: 'Drying · stop',
            aktBeutel: 'Dry dust bag',
            aktEntleeren: 'Empty now',
            aktAblassen: 'Drain water',
            aktTankLeeren: 'Empty water tank',
            aktStationReinigen: 'Clean station',
            aktSelbstreparatur: 'Self-repair',
            aktNachreinigen: 'Re-clean',
            folge_drain: 'The station drains its water. Washing and mopping work again once water is refilled.',
            folge_empty_tank: 'The clean water tank is emptied; its water is discarded. Refill the tank afterwards.',
            folge_self_repair: 'The station checks and repairs itself. This takes a few minutes; it neither washes nor dries meanwhile.',
            folge_station_cleaning: 'The robot leaves the dock so the station can clean itself. It does not always return by itself; then tap “Return to dock”.',
            folge_recleaning: 'The robot leaves the dock and re-cleans the areas it missed or found dirty last time.',
            starten: 'Start',
            wirdGestartet: 'Starting …',
            aktionFehler: '{name} did not start ({grund}). Nothing changed at the station. Check station and robot and try again; if that does not help, check the dreame_vacuum integration.',
            stationEinstellungen: 'Station settings',
            shortcuts: 'Shortcuts',
            skripte: 'Scripts',
            laeuft: 'running',
            skripteFehlen: 'Not found: {liste}.',
            verwalten: 'Manage',
            shortcutsVerwalten: 'Manage shortcuts',
            keineShortcuts: 'No shortcuts on the device. Create shortcuts in the Dreame app, then “Reload” here.',
            neuLaden: 'Reload',
            umbenennen: 'Rename',
            loeschenLaeuft: 'Running — delete it afterwards.',
            feld_shortcut_name: 'Name',
            nameFehlt: 'Please enter a name.',
            nameNummer: 'If the name exists already, the device appends a number.',
            frageShortcutLoeschen: 'Delete shortcut “{name}”? It also disappears from the Dreame app.',
            shortcutZusaetzlich: 'A task is running — the shortcut starts in addition; the robot decides what happens to the running task.',
            sperreAblassen: 'No shortcut starts while the station drains water. Wait until draining has finished.',
            shortcutFehler: '{name} did not start ({grund}). The robot carries on as before. Try again; if that does not help, check the dreame_vacuum integration.',
            stationStatus: 'Station status',
            alleWerte: 'All station values ({n})',
            reiter_wash: 'Washing',
            reiter_dry: 'Drying',
            reiter_empty: 'Emptying',
            wartung: 'Maintenance',
            sperre_selfClean: 'Only with mop self-cleaning on.',
            sperre_smartWash: 'Only with smart mop washing off; it picks the temperature itself.',
            sperre_cleanGenius: 'Cannot change during a CleanGenius cleaning.',
            sperre_notByTime: 'Only when self-cleaning runs by area or room, not by time.',
            sperre_byTime: 'Only when self-cleaning runs by time.',
            sperre_notDrying: 'Cannot change while drying.',
            sperre_autoDrying: 'Only with automatic drying on and smart drying off.',
            sperre_autoEmpty: 'Only with auto-emptying on.',
            sperre_customized: 'Customized Cleaning is on: this value is set per room.',
            sperre_customizedMode: 'Customized Cleaning is on: this value is set per room.',
            sperre_savedMap: 'Only with a saved map, not a temporary one.',
            sperre_cleangeniusListe: 'CleanGenius is not possible now: during a task, for zones/spots or without the mop attached.',
            einstellungen: 'Settings',
            reinigungseinstellungen: 'Cleaning settings',
            abschnitt_cleangenius: 'CleanGenius',
            abschnitt_basic: 'Basics',
            abschnitt_customized: 'Customized Cleaning',
            abschnitt_sequence: 'Cleaning sequence',
            abschnitt_more: 'More',
            weitereReinigung: 'More cleaning settings',
            wiederholungenHinweis: 'Applies to rooms without Customized Cleaning, zones and spots.',
            cleanGeniusRaeume: 'CleanGenius picks the settings per room itself.',
            raeumeEinstellen: 'Room settings',
            keineRaeume: 'No rooms on the active map.',
            durchgaenge: 'Passes',
            raumUnvollstaendig: 'A value of this room is unknown; the card sends nothing instead of guessing.',
            aufAlleTitel: 'Apply to all rooms',
            aufAlleFrage: 'The values of {raum} replace those of these rooms: {raeume}.',
            aufAlleStand: '{n} of {gesamt} rooms done.',
            aufAlleFehler: 'Stopped: {grund}. Already changed: {raeume}. Try again once the robot rests.',
            uebertragen: 'Apply',
            abschnitt_unordered: 'Without order',
            raumPlatz: '{name}, position {n} of {gesamt}',
            raumGegriffen: '{name} grabbed, position {n} of {gesamt}. Arrows move, Space drops, Escape cancels.',
            raumVerschoben: '{name} to position {n} of {gesamt}.',
            raumAbgelegt: '{name} dropped at position {n}.',
            raumAbgebrochen: 'Move cancelled, {name} back at position {n}.',
            nachOben: 'Move {name} up',
            nachUnten: 'Move {name} down',
            anDenAnfang: 'Move {name} to the top',
            herausnehmen: 'Take {name} out of the sequence',
            einreihen: 'Add {name} at the end',
            einreihenKurz: 'Add',
            antippen: 'Tap in order',
            antippenHinweis: 'Tap the rooms in their new order; rooms not tapped follow in their previous order.',
            fertig: 'Done',
            reihenfolgeAus: 'Sequence off',
            reihenfolgeAusFolge: 'Without order once saved: {raeume}.',
            reihenfolgeLeer: 'No own sequence: the robot picks it.',
            status_washing: 'Mop washing',
            status_washing_paused: 'Washing paused',
            status_drying: 'Drying',
            status_draining_available: 'Draining possible',
            status_washing_available: 'Washing possible',
            status_drying_available: 'Drying possible',
            status_dust_collection_available: 'Emptying possible',
            gruppe_cleaning: 'Cleaning',
            gruppe_mopping: 'Mopping',
            gruppe_carpet: 'Carpet',
            gruppe_station: 'Station',
            gruppe_camera: 'Camera and AI',
            gruppe_audio: 'Audio',
            gruppe_dnd: 'Do not disturb',
            gruppe_schedule: 'Schedules',
            gruppe_battery: 'Battery',
            gruppe_consumables: 'Consumables',
            gruppe_info: 'Device info',
            gruppe_other: 'Other',
            set_custom_mopping_mode: 'Custom mopping mode',
            sucheLabel: 'Search settings',
            stationWaschen: 'Station: washing, water temperature, washing frequency',
            sprachpaket: 'Voice pack',
            sprachpaketTitel: 'Install voice pack',
            sprachpaketHinweis: 'The integration has no catalogue: address, MD5 checksum and size of the pack must come from a trusted source. All fields are required.',
            feld_lang_id: 'Language ID',
            feld_url: 'Pack address (URL)',
            feld_md5: 'MD5 checksum',
            feld_size: 'Size in bytes',
            fehlerSprachId: 'Required: letters, digits, - or _ (e.g. DE).',
            fehlerUrl: 'Required: full address with http:// or https://, without blanks or quotes.',
            fehlerMd5: 'Required: exactly 32 characters of 0–9 and a–f.',
            fehlerGroesse: 'Required: a whole number above 0.',
            weiter: 'Next',
            installieren: 'Install',
            sprachpaketFrageTitel: 'Install voice pack?',
            sprachpaketFrage: 'Install pack “{id}” ({groesse} bytes) from {url}? The robot downloads it and replaces its voice with it.',
            sprachpaketGesendet: 'Installation of “{id}” requested. Once the device is done, “Voice pack” shows the new ID.',
            eingabenBleiben: 'Your input is kept.',
            taeglich: 'Daily',
            bestaetigenTitel: 'Change {name}?',
            rest: '{prozent} left · {zeit}',
            zuruecksetzen: 'Reset',
            zuruecksetzenVon: 'Reset {name}',
            zuruecksetzenTitel: 'Reset {name}?',
            zuruecksetzenFrage: 'Reset {name}? Currently {prozent} left; afterwards the device counts from 100 % again. Only after replacing or cleaning the part.',
            schonVoll: 'Already at 100 %.',
            summen: 'Totals',
            planHinweis: 'The integration provides schedules only parsed. Saving rewrites all schedules from these values; extra details of the Dreame app that the integration does not pass on are lost.',
            keinePlaene: 'No schedules. Create the first one in the Dreame app; afterwards more can be added here with its cleaning settings.',
            planNeu: 'Add schedule',
            planBearbeiten: 'Edit schedule',
            zeitplan: 'Schedule',
            ungueltig: 'Invalid',
            karteNr: 'Map {id}',
            planReinigung: '{karte} · suction {saugen} · water {wasser}',
            feld_time: 'Time',
            feld_days_plan: 'Days (none = once)',
            planLoeschenTitel: 'Delete schedule?',
            planLoeschenFrage: 'Permanently delete the schedule at {zeit} ({tage})?',
            hersteller: 'Manufacturer',
            modell: 'Model',
            firmware: 'Firmware',
            seriennummer: 'Serial number',
            wlan: 'Wi-Fi',
            signal: 'Signal',
            zeitzone: 'Time zone',
            stationOk: 'all right',
            stoerungen: 'Faults',
            keine: 'None',
            set_task_status: 'Task status',
            set_total_runtime: 'Total runtime',
            set_total_cruise_time: 'Total cruising time',
            set_track_cleaning_left: 'Track cleaning',
            frage_map_rotation: 'Rotate the robot’s stored map to {wert}? This changes the map in the device, not only the display.',
            aendern: 'Change',
            einmalig: 'Once',
            zeitraum: 'Period',
            bearbeitenVon: 'Edit {name}',
            keineZeitraeume: 'No period. Set up “Do not disturb” once in the Dreame app; then change start and end here.',
            zeitraumNeu: 'Add period',
            zeitraumBearbeiten: 'Edit period',
            feld_start: 'Start',
            feld_end: 'End',
            fehlerZeit: 'Required: time as HH:MM.',
            fehlerGleich: 'End must differ from start.',
            ungespeichert: 'Changes are not saved yet.',
            verwerfen: 'Discard',
            speichern: 'Save',
            loeschen: 'Delete',
            zeitraumLoeschenTitel: 'Delete period?',
            zeitraumLoeschenFrage: 'Permanently delete period {zeitraum}?',
            treffer: '{n} results',
            keineTreffer: 'No setting found. Try another term.',
            dauerMin: '{m} min',
            dauerStdMin: '{h} h {m} min',
            laufFertig: 'Done',
            laufAuffaellig: 'Notice',
            laufUnterbrochen: 'Interrupted',
            einLauf: '1 run',
            laeufe: '{n} runs',
            gruppeTitel: 'Cleaning + re-cleaning',
            verlaufLeer: 'No history — the integration loads it only with a cloud connection.',
            raumNr: 'Room {id}',
            verlaufDauer: 'Duration',
            verlaufArt: 'Cleaning type',
            verlaufKarte: 'Map',
            verlaufFlaeche: 'Area',
            verlaufSaugstufe: 'Suction level',
            verlaufMop: 'Mop',
            verlaufTank: 'Water tank',
            verlaufStart: 'Started by',
            verlaufEntleert: 'Emptyings',
            verlaufGewaschen: 'Mop washes',
            verlaufGrund: 'Interrupt reason',
            verlaufHaustier: 'Pet',
            laedtLauf: 'Loading the run\'s data …',
            keineLaufdaten: 'No map and no further data for this run.',
            laufFehler: 'The run\'s data could not be loaded ({grund}).',
            erneut: 'Retry',
            laufWeg: 'This run is no longer in the history.',
            neuer: 'Newer',
            aelter: 'Older',
            blockierteRaeume: 'Blocked rooms',
            laufKarte: 'Map of the run',
            laufKarteAlt: 'Map of the run on {datum}',
            wlanKarteAlt: 'WiFi map of the run on {datum}',
            reinigungsKarte: 'Cleaning map',
            wlanKarte: 'WiFi map',
            keineLaufKarte: 'No map for this run.',
            keineWlanKarte: 'No WiFi map for this run.',
            laufHindernisse: 'Obstacles',
            nachRaeume: 'Blocked rooms to re-clean',
            nachWaehlen: 'Choose at least one room.',
            nachAufgabeLaeuft: 'Locked while a task is running.',
            nachLaedt: 'Waiting for the run\'s data.',
            nachOhneDaten: 'Without the run\'s data the map cannot be checked.',
            nachAndereKarte: 'Locked: this run was on another map than the current one.',
            nachFrageAlle: 'The robot leaves the dock and re-cleans {raeume}.',
            nachFrageTeil: 'The robot leaves the dock and cleans {raeume} as a new room cleaning — the history shows a new run, not a re-cleaning of this one.'
        }
    }
};

function textTable(hass) {
    return BuschUI.dictionary(TEXTE_BUSCH_VACUUM_CARD, hass, { legacy: true });
}

function translate(hass, key, vars) {
    const table = textTable(hass);
    let text = table.texte[key] !== undefined ? table.texte[key] : TEXTE_BUSCH_VACUUM_CARD.en.texte[key];
    if (text === undefined) return key;
    Object.keys(vars || {}).forEach((name) => { text = text.split('{' + name + '}').join(String(vars[name])); });
    return text;
}

const fieldLabel = (hass, name) => BuschUI.fieldText(TEXTE_BUSCH_VACUUM_CARD, hass, name, { legacy: true }).label;
const fieldHelper = (hass, name) => BuschUI.fieldText(TEXTE_BUSCH_VACUUM_CARD, hass, name, { legacy: true }).helper;

/**
 * Carries a dictionary key, not a sentence: `setConfig` runs before `hass`
 * exists, so the language is only known when the error box is drawn.
 */
class ConfigError extends Error {
    constructor(key, vars) {
        super(key);
        this.name = 'ConfigError';
        this.textKey = key;
        this.textVars = vars || null;
    }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const LOCK_MODES = ['auto', 'only_touch', 'never', 'always'];
const TOUCH_LOCK_MS = { min: 100, max: 400, standard: 200 };

/** Parts `hidden_card_objects` can hide (inventory CORE-18); shortcuts takes effect with its module. */
const HIDDEN_OBJECTS = [
    'title', 'state', 'menu', 'status', 'task_type', 'controls', 'action_buttons', 'animations', 'shortcuts',
    'cruising_history', 'error_message', 'warning_message', 'info_message', 'low_water_message',
    'map_change_confirmation', 'progress_bar', 'dock_status_indicator'
];

/**
 * Map objects `hidden_objects` can hide (MAP-03), one layer each. Image mode
 * cannot hide what the integration burns into its picture (spec map-view, R24).
 */
const MAP_OBJECTS = [
    'rooms', 'cleaning_settings', 'blocked_rooms', 'robot', 'charger', 'station_status', 'router', 'path',
    'carpets', 'detected_carpets', 'deleted_carpets', 'furnitures', 'no_go_areas', 'no_mopping_areas',
    'virtual_walls', 'passable_thresholds', 'impassable_thresholds', 'ramps', 'curtains', 'predefined_points',
    'obstacles', 'stains', 'pets'
];

/** MAP-05/09: display, colour scheme, icon set and the colours override_colors may set. */
const MAP_DISPLAYS = ['standard', 'floor_plan'];
const COLOR_SCHEMES = ['auto', 'light', 'dark', 'grey'];
const ICON_SETS = ['busch', 'material'];
const OVERRIDE_KEYS = ['floor', 'wall', 'room', 'carpet', 'no_go', 'no_mop', 'virtual_wall', 'path', 'robot', 'charger'];
const SAFE_COLOR = /^(?:#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla)\([\d\s.,%]+\)|[a-z]+)$/i;

function normalizeColors(raw) {
    // A string as in YAML, or [r, g, b] from the editor's colour picker (color_rgb).
    const color = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(Number(n)))
        ? 'rgb(' + v.map((n) => Math.min(255, Math.max(0, Math.round(Number(n))))).join(', ') + ')'
        : typeof v === 'string' && SAFE_COLOR.test(v.trim()) ? v.trim() : null;
    const pick = (source) => Object.fromEntries(OVERRIDE_KEYS
        .map((key) => [key, color((source || {})[key])]).filter(([, v]) => v));
    if (!raw || typeof raw !== 'object') return {};
    const out = pick(raw);
    const dark = pick(raw.dark);
    if (Object.keys(dark).length) out.dark = dark;
    return out;
}

/** Per map (`map_config.map_<index>`, MAP-06) with what applies when a value is missing. */
const MAP_CONFIG_DEFAULTS = {
    rotation: 0, scale: 1, opacity: 1, object_scale: 1, object_opacity: 1, font_size: 12, crop: null,
    background_image: null, overlay_image: null, hidden_objects: []
};
const MAP_ROTATIONS = [0, 90, 180, 270];

/** An own picture on the map: a safe URL and its corners in robot mm (values from the map info). */
function mapPicture(value) {
    if (!value || typeof value !== 'object' || typeof value.url !== 'string') return null;
    const url = value.url.trim();
    if (!url || /^(?:javascript|vbscript|file|data:text):/i.test(url)) return null;
    const corners = ['x0', 'y0', 'x1', 'y1'].map((k) => numberOf(value[k]));
    if (!corners.every(Number.isFinite)) return null;
    return { url, x0: corners[0], y0: corners[1], x1: corners[2], y1: corners[3] };
}

const inRange = (value, min, max, standard) => {
    const n = numberOf(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : standard;
};

/** `map_config`: only `map_<index>` keys, each value checked; unknown keys dropped. */
function normalizeMapConfig(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const [key, value] of Object.entries(raw)) {
        if (!/^map_\d+$/.test(key) || !value || typeof value !== 'object') continue;
        const entry = {};
        if (value.rotation !== undefined) entry.rotation = MAP_ROTATIONS.includes(Number(value.rotation)) ? Number(value.rotation) : 0;
        if (value.scale !== undefined) entry.scale = inRange(value.scale, 0.25, 4, 1);
        if (value.opacity !== undefined) entry.opacity = inRange(value.opacity, 0, 1, 1);
        if (value.crop && typeof value.crop === 'object') {
            entry.crop = Object.fromEntries(['top', 'right', 'bottom', 'left'].map((side) => [side, inRange(value.crop[side], 0, 45, 0)]));
        }
        for (const key of ['background_image', 'overlay_image']) {
            const picture = mapPicture(value[key]);
            if (picture) entry[key] = picture;
        }
        if (value.object_scale !== undefined) entry.object_scale = inRange(value.object_scale, 0.25, 4, 1);
        if (value.object_opacity !== undefined) entry.object_opacity = inRange(value.object_opacity, 0, 1, 1);
        if (value.font_size !== undefined) entry.font_size = inRange(value.font_size, 6, 40, 12);
        if (Array.isArray(value.hidden_objects)) entry.hidden_objects = value.hidden_objects.filter((n) => MAP_OBJECTS.includes(n));
        out[key] = entry;
    }
    return out;
}

const COLOR_FIELDS = OVERRIDE_KEYS.map((name) => ({ name, selector: { color_rgb: {} } }));
const MAP_NUMBER = (min, max, step, unit) => ({ number: Object.assign({ min, max, step, mode: 'box' }, unit ? { unit_of_measurement: unit } : {}) });
const PICTURE_FIELDS = [
    { name: 'url', selector: { text: {} } },
    ...['x0', 'y0', 'x1', 'y1'].map((name) => ({ name, selector: MAP_NUMBER(-100000, 100000, 1, 'mm') }))
];

/** The fields of one `map_config.map_<index>` block (MAP-06). */
const MAP_CONFIG_FIELDS = [
    { name: 'rotation', selector: { select: { mode: 'dropdown', options: MAP_ROTATIONS.map(String) } } },
    { name: 'scale', selector: MAP_NUMBER(0.25, 4, 0.05) },
    { name: 'opacity', selector: MAP_NUMBER(0, 1, 0.05) },
    { name: 'object_scale', selector: MAP_NUMBER(0.25, 4, 0.05) },
    { name: 'object_opacity', selector: MAP_NUMBER(0, 1, 0.05) },
    { name: 'font_size', selector: MAP_NUMBER(6, 40, 1, 'px') },
    { name: 'crop', type: 'expandable', icon: 'mdi:crop', schema: ['top', 'right', 'bottom', 'left'].map((name) => ({ name, selector: MAP_NUMBER(0, 45, 1, '%') })) },
    { name: 'background_image', type: 'expandable', icon: 'mdi:image-outline', schema: PICTURE_FIELDS },
    { name: 'overlay_image', type: 'expandable', icon: 'mdi:image-multiple-outline', schema: PICTURE_FIELDS },
    { name: 'hidden_objects', selector: { select: { multiple: true, mode: 'list', options: MAP_OBJECTS } } }
];

/** What one floor block shows for unset values; equal values are never written. */
const MAP_EDITOR_DEFAULTS = { rotation: '0', scale: 1, opacity: 1, object_scale: 1, object_opacity: 1, font_size: 12, hidden_objects: [] };

/** Every option the card reads; the editor translates the select options (localSchema). */
const SCHEMA_BUSCH_VACUUM_CARD = [
    { name: 'entity', required: true, selector: { entity: { domain: 'vacuum' } } },
    { name: 'title', selector: { text: {} } },
    { name: 'scripts', selector: { entity: { domain: 'script', multiple: true } } },
    { name: 'layout_section', type: 'expandable', flatten: true, icon: 'mdi:page-layout-body', schema: [
        { name: 'full_height', selector: { boolean: {} } },
        { name: 'aspect_ratio', selector: { text: {} } },
        { name: 'max_height_offset', selector: { number: { min: 0, max: 400, step: 1, mode: 'box', unit_of_measurement: 'px' } } },
        { name: 'left_handed', selector: { boolean: {} } }
    ] },
    { name: 'operation_section', type: 'expandable', flatten: true, icon: 'mdi:lock-outline', schema: [
        { name: 'locked', selector: { select: { mode: 'dropdown', options: LOCK_MODES } } },
        { name: 'touch_lock', selector: { number: { min: TOUCH_LOCK_MS.min, max: TOUCH_LOCK_MS.max, step: 10, mode: 'slider', unit_of_measurement: 'ms' } } },
        { name: 'disable_haptic', selector: { boolean: {} } }
    ] },
    { name: 'display_section', type: 'expandable', flatten: true, icon: 'mdi:eye-off-outline', schema: [
        { name: 'hidden_card_objects', selector: { select: { multiple: true, mode: 'list', options: HIDDEN_OBJECTS } } }
    ] },
    { name: 'map_section', type: 'expandable', flatten: true, icon: 'mdi:map-outline', schema: [
        { name: 'map_display', selector: { select: { mode: 'dropdown', options: MAP_DISPLAYS } } },
        { name: 'color_scheme', selector: { select: { mode: 'dropdown', options: COLOR_SCHEMES } } },
        { name: 'icon_set', selector: { select: { mode: 'dropdown', options: ICON_SETS } } },
        { name: 'hidden_objects', selector: { select: { multiple: true, mode: 'list', options: MAP_OBJECTS } } },
        { name: 'override_colors', type: 'expandable', icon: 'mdi:palette-outline', schema: [
            ...COLOR_FIELDS,
            { name: 'dark', type: 'expandable', icon: 'mdi:weather-night', schema: COLOR_FIELDS }
        ] },
        // One block per floor of the vacuum's `maps`, filled in by the editor (editorSchema).
        { name: 'map_config', type: 'expandable', icon: 'mdi:layers-outline', schema: [] }
    ] }
];

/** What the editor shows for an unset option; equal values are never written. */
const EDITOR_DEFAULTS = {
    title: '', scripts: [], full_height: false, aspect_ratio: '', max_height_offset: 0, left_handed: false,
    locked: 'auto', touch_lock: TOUCH_LOCK_MS.standard, disable_haptic: false, hidden_card_objects: [],
    map_display: 'standard', color_scheme: 'auto', icon_set: 'busch', hidden_objects: [], override_colors: {}, map_config: {}
};

/** Drops what equals the defaults from the nested map options, so the YAML stays minimal. */
function pruneMapOptions(config) {
    const filled = (v) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length);
    const colors = (source) => Object.fromEntries(Object.entries(source || {}).filter(([k, v]) => k !== 'dark' && filled(v)));
    if (config.override_colors) {
        const out = colors(config.override_colors);
        const dark = colors(config.override_colors.dark);
        if (Object.keys(dark).length) out.dark = dark;
        if (Object.keys(out).length) config.override_colors = out;
        else delete config.override_colors;
    }
    if (config.map_config) {
        const out = {};
        for (const [key, raw] of Object.entries(config.map_config)) {
            const entry = {};
            for (const [name, value] of Object.entries(raw || {})) {
                if (!filled(value)) continue;
                if (name === 'rotation') { if (Number(value) !== 0) entry.rotation = Number(value); continue; }
                if (name === 'crop') {
                    const crop = Object.fromEntries(Object.entries(value).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)]));
                    if (Object.keys(crop).length) entry.crop = crop;
                    continue;
                }
                if (name === 'background_image' || name === 'overlay_image') {
                    if (value && typeof value.url === 'string' && value.url.trim()) entry[name] = value;
                    continue;
                }
                if (BuschUI.configsEqual(value, MAP_EDITOR_DEFAULTS[name])) continue;
                entry[name] = value;
            }
            if (Object.keys(entry).length) out[key] = entry;
        }
        if (Object.keys(out).length) config.map_config = out;
        else delete config.map_config;
    }
    return config;
}

const numberOf = (value) => (value === undefined || value === null || value === '' ? NaN : Number(value));

/** `16:9`, `16/9` or a number → a CSS aspect-ratio value, else null. */
function aspectRatio(value) {
    if (typeof value === 'number') return value > 0 ? String(value) : null;
    const match = /^\s*(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)\s*$/.exec(String(value || ''));
    if (match) return Number(match[1]) > 0 && Number(match[2]) > 0 ? match[1] + ' / ' + match[2] : null;
    const single = numberOf(value);
    return Number.isFinite(single) && single > 0 ? String(single) : null;
}

function normalizeConfig(raw) {
    const entity = raw && typeof raw.entity === 'string' ? raw.entity.trim() : '';
    if (!entity) throw new ConfigError('fehlerKeineEntitaet');
    if (domainOf(entity) !== 'vacuum') throw new ConfigError('fehlerFalscheDomain', { entity });
    const offset = numberOf(raw.max_height_offset);
    const hold = numberOf(raw.touch_lock);
    return {
        entity,
        title: typeof raw.title === 'string' ? raw.title.trim() : '',
        scripts: Array.isArray(raw.scripts) ? raw.scripts.filter((id) => typeof id === 'string' && domainOf(id) === 'script') : [],
        hidden_card_objects: Array.isArray(raw.hidden_card_objects) ? raw.hidden_card_objects.filter((name) => HIDDEN_OBJECTS.includes(name)) : [],
        left_handed: raw.left_handed === true,
        full_height: raw.full_height === true,
        aspect_ratio: aspectRatio(raw.aspect_ratio),
        max_height_offset: Number.isFinite(offset) ? offset : 0,
        locked: LOCK_MODES.includes(raw.locked) ? raw.locked : 'auto',
        touch_lock: Number.isFinite(hold) ? Math.min(TOUCH_LOCK_MS.max, Math.max(TOUCH_LOCK_MS.min, hold)) : TOUCH_LOCK_MS.standard,
        disable_haptic: raw.disable_haptic === true,
        hidden_objects: Array.isArray(raw.hidden_objects) ? raw.hidden_objects.filter((name) => MAP_OBJECTS.includes(name)) : [],
        map_display: MAP_DISPLAYS.includes(raw.map_display) ? raw.map_display : 'standard',
        color_scheme: COLOR_SCHEMES.includes(raw.color_scheme) ? raw.color_scheme : 'auto',
        icon_set: ICON_SETS.includes(raw.icon_set) ? raw.icon_set : 'busch',
        override_colors: normalizeColors(raw.override_colors),
        map_config: normalizeMapConfig(raw.map_config)
    };
}

function touchDevice() {
    try {
        if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) return true;
    } catch (e) {
        // no media queries: fall back to the touch point count
    }
    return typeof navigator !== 'undefined' && Number(navigator.maxTouchPoints) > 0;
}

/** CORE-14: whether the map starts locked. auto = touch outside a panel view. */
function startsLocked(mode, touch, panel) {
    if (mode === 'always') return true;
    if (mode === 'only_touch') return touch;
    if (mode === 'auto') return touch && !panel;
    return false;
}

const HAPTIC_MS = 10;

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** HA's locale; `system` means the browser's. */
function localeOf(hass) {
    const locale = (hass && hass.locale) || {};
    const browser = typeof navigator !== 'undefined' && navigator.language;
    return { locale, language: locale.language || browser || 'en', browser: browser || 'en' };
}

/** CORE-16: a clock time in HA's 12/24 h setting (`language` and `system` follow the locale). */
function clockText(hass, hours, minutes) {
    const { locale, language, browser } = localeOf(hass);
    const format = locale.time_format;
    const tag = format === 'system' ? browser : language;
    const hour12 = format === '12' ? true : format === '24' ? false : !!new Intl.DateTimeFormat(tag, { hour: 'numeric' }).resolvedOptions().hour12;
    // As HA's own formatTime: 24 h with two digits (09:30), 12 h without (9:30 AM).
    return new Intl.DateTimeFormat(tag, { hour: hour12 ? 'numeric' : '2-digit', minute: '2-digit', hourCycle: hour12 ? 'h12' : 'h23' })
        .format(new Date(2000, 0, 1, hours, minutes));
}

/** CORE-16: first day of the week as in Date#getDay (0 = Sunday), from HA, else the locale. */
function firstWeekday(hass) {
    const { locale, language, browser } = localeOf(hass);
    const day = WEEKDAYS.indexOf(locale.first_weekday);
    if (day >= 0) return day;
    try {
        const info = new Intl.Locale(locale.first_weekday === 'system' ? browser : language);
        const week = typeof info.getWeekInfo === 'function' ? info.getWeekInfo() : info.weekInfo;
        if (week && week.firstDay) return week.firstDay % 7;
    } catch (e) {
        // no week data in this browser: Monday, as in most of Europe
    }
    return 1;
}

// ---------------------------------------------------------------------------
// Device model (CORE-01/02)
// ---------------------------------------------------------------------------

/** VacuumEntityFeature bits of Home Assistant that the card asks about. */
const VACUUM_FEATURES = {
    pause: 4, stop: 8, return_home: 16, fan_speed: 32, send_command: 256,
    locate: 512, clean_spot: 1024, start: 8192
};

/** The map cameras of dreame_vacuum, by translation key. */
const MAP_ROLES = ['map', 'saved_map', 'wifi_map', 'map_data'];

const objectIdOf = (entityId) => String(entityId || '').split('.').slice(1).join('.');

/** Camera role from its translation key, or from the entity id when the key is missing. */
function cameraRole(key) {
    if (MAP_ROLES.includes(key)) return key;
    if (/^wifi_map(_\d+)?$/.test(key)) return 'wifi_map';
    if (/^map_\d+$/.test(key)) return 'saved_map';
    return null;
}

/**
 * Every entity of the vacuum's device, filed by role:
 *   device  `<domain>.<translation_key>` → entity id (select.suction_level …)
 *   rooms   room number → the same, per room (select.robo_room_3_suction_level)
 *   maps    camera role → entity ids (current, saved per floor, Wi-Fi, raw data)
 *
 * Found through `hass.entities` (the frontend's registry, no request of its
 * own). Without a device id — older frontends, or an entity outside the
 * registry — the entity id prefix of the vacuum is the fallback. Disabled
 * entities are never in `hass.entities`; their values come from the vacuum's
 * attributes (VacuumModel.attr), their writes from the integration's services.
 */
function findRelated(hass, entityId) {
    const registry = (hass && hass.entities) || {};
    const own = registry[entityId];
    const prefix = objectIdOf(entityId) + '_';
    const found = own && own.device_id
        ? Object.values(registry).filter((e) => e.device_id === own.device_id && e.entity_id !== entityId).map((e) => e.entity_id)
        : Object.keys((hass && hass.states) || {}).filter((id) => id !== entityId && objectIdOf(id).startsWith(prefix));
    const related = { ids: [entityId], device: {}, rooms: {}, maps: { map: [], saved_map: [], wifi_map: [], map_data: [] } };
    found.sort().forEach((id) => {
        const domain = domainOf(id);
        const objectId = objectIdOf(id);
        const rest = objectId.startsWith(prefix) ? objectId.slice(prefix.length) : objectId;
        // shortcut: the room number comes from the entity id (room_<n>_…); a renamed
        // per-room entity lands with the device ones. Upgrade if users rename them.
        const room = /^room_(\d+)_/.exec(rest);
        const entry = registry[id];
        const key = (entry && entry.translation_key) || (room ? rest.slice(room[0].length) : rest);
        related.ids.push(id);
        const role = domain === 'camera' ? cameraRole(key) : null;
        if (role) related.maps[role].push(id);
        else if (room) (related.rooms[room[1]] = related.rooms[room[1]] || {})[domain + '.' + key] = id;
        else related.device[domain + '.' + key] = id;
    });
    return related;
}

/**
 * Consumables: attribute `<name>_left` → what `vacuum_reset_consumable`
 * takes (vacuum.py#L129, #L809); `null` = reset through the action
 * `reset_track_cleaning` (types.py:1585). `dust_bag_drying_left` and
 * `drying_left` are dock countdowns, no consumables (spec device-settings).
 */
const CONSUMABLES = {
    main_brush: 'main_brush', side_brush: 'side_brush', filter: 'filter', tank_filter: 'tank_filter', mop_pad: 'mop_pad',
    silver_ion: 'silver_ion', detergent: 'detergent', squeegee: 'squeegee', onboard_dirty_water_tank: 'onboard_dirty_water_tank',
    deodorizer: 'deodorizer', scale_inhibitor: 'scale_inhibitor', washboard_cleaning: 'washboard_cleaning',
    sensor_dirty: 'sensor', dirty_water_channel_dirty: 'dirty_water_channel', wheel_dirty: 'wheel', fluffing_roller_dirty: 'fluffing_roller',
    roller_mop_filter_dirty: 'roller_mop_filter', water_outlet_filter_dirty: 'water_outlet_filter', track_cleaning: null
};

/**
 * What the device can do. `can()` is the ONE place every part of the card
 * asks (spec: Boundaries) — from the vacuum's `capabilities`, its feature
 * bits, the entities found and the services Home Assistant offers.
 */
class VacuumModel {
    constructor(hass, entityId, related) {
        this.hass = hass;
        this.entityId = entityId;
        this.state = (hass && hass.states && hass.states[entityId]) || null;
        this.related = related || findRelated(hass, entityId);
        const caps = this.state && this.state.attributes.capabilities;
        this.caps = new Set(Array.isArray(caps) ? caps : []);
        this.features = Number((this.state && this.state.attributes.supported_features) || 0);
    }

    /** One of the device's entities by `<domain>.<translation_key>`, or null. */
    entity(key) {
        return this.related.device[key] || null;
    }

    /** Consumables left in percent (`main_brush_left` …), by the fixed table CONSUMABLES. */
    consumables() {
        const found = [];
        for (const name of Object.keys(CONSUMABLES)) {
            const value = this.attr(name + '_left');
            if (value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value))) found.push([name + '_left', Number(value)]);
        }
        return Object.fromEntries(found);
    }

    /** A value of the vacuum itself — also for settings whose entity is disabled. */
    attr(name) {
        return this.state ? this.state.attributes[name] : undefined;
    }

    can(name) {
        if (name.includes('.')) {
            const [domain, service] = name.split('.');
            const services = (this.hass && this.hass.services) || {};
            return !!(services[domain] && services[domain][service]);
        }
        switch (name) {
            case 'map': return this.related.maps.map.length > 0;
            // Drying alone (dust bag) is a station too (DOCK-01).
            case 'dock': return ['self_wash_base', 'auto_empty_base', 'dust_bag_drying', 'manual_dust_bag_drying'].some((c) => this.caps.has(c));
            // Station actions (dock): the capability of the integration's button (button.py#L196–L296)
            // plus vacuum_call_action — never the button itself, it may be disabled.
            case 'wash': case 'dry': case 'self_repair': return this.caps.has('self_wash_base') && this.can('dreame_vacuum.vacuum_call_action');
            case 'dust_bag_dry': return (this.caps.has('dust_bag_drying') || this.caps.has('manual_dust_bag_drying')) && this.can('dreame_vacuum.vacuum_call_action');
            case 'empty': return this.caps.has('auto_empty_base') && this.can('dreame_vacuum.vacuum_call_action');
            case 'drain': return this.caps.has('drainage') && this.can('dreame_vacuum.vacuum_call_action');
            case 'empty_tank': return this.caps.has('water_tank_draining') && this.can('dreame_vacuum.vacuum_call_action');
            case 'station_cleaning': return this.caps.has('station_cleaning') && this.can('dreame_vacuum.vacuum_call_action');
            case 'recleaning': return this.caps.has('auto_recleaning') && this.caps.has('map') && this.can('dreame_vacuum.vacuum_call_action');
            case 'history': return !!this.entity('sensor.cleaning_history');
            case 'cruising_history': return this.caps.has('cruising') && !!this.entity('sensor.cruising_history');
            // CORE-10: the button is what v2.0.3 offers; the documented service only if present.
            case 'clear_warning': return !!this.entity('button.clear_warning') || this.can('dreame_vacuum.vacuum_clear_warning');
            case 'consumables': return Object.keys(this.consumables()).length > 0;
            case 'remote': return this.can('dreame_vacuum.vacuum_remote_control_move_step');
            case 'settings': return this.can('dreame_vacuum.vacuum_set_property');
            case 'shortcuts': return this.caps.has('shortcuts') && this.can('dreame_vacuum.vacuum_start_shortcut');
            case 'shortcut_manage': return this.can('shortcuts') && this.can('dreame_vacuum.vacuum_rename_shortcut') && this.can('dreame_vacuum.vacuum_delete_shortcut');
            default:
                if (VACUUM_FEATURES[name]) return (this.features & VACUUM_FEATURES[name]) !== 0;
                return this.caps.has(name);
        }
    }
}

// ---------------------------------------------------------------------------
// Settings (device-settings): one table, one row, one write path — also for
// dock and clean-settings (R08)
// ---------------------------------------------------------------------------

/** Groups of the settings overview, in order. `module`: the view belongs to another module. */
const SETTING_GROUPS = [
    { name: 'cleaning', icon: 'mdi:robot-vacuum' },
    { name: 'mopping', icon: 'mdi:water-outline' },
    { name: 'carpet', icon: 'mdi:rug' },
    { name: 'station', icon: 'mdi:home-variant-outline' },
    { name: 'camera', icon: 'mdi:camera-outline' },
    { name: 'audio', icon: 'mdi:volume-high' },
    { name: 'dnd', icon: 'mdi:minus-circle-outline' },
    { name: 'schedule', icon: 'mdi:calendar-clock' },
    { name: 'battery', icon: 'mdi:battery-charging-outline' },
    { name: 'consumables', icon: 'mdi:wrench-clock' },
    { name: 'info', icon: 'mdi:information-outline' },
    { name: 'other', icon: 'mdi:tune-variant' }
];

/**
 * Every device-level switch/select/number/time of dreame_vacuum v2.0.3
 * (switch.py SWITCHES, select.py SELECTS, number.py NUMBERS, time.py TIMES),
 * by group and control; tests/einstellungen.test.js checks it against the
 * source's key list. All write through `vacuum_set_property` (vacuum.py#L901),
 * the integration turns list names into its values (device.py#L2692).
 * Group `clean` is clean-settings', `station` dock's: same row, same writer.
 */
const SETTING_KEYS = {
    cleaning: {
        switch: ['resume_cleaning', 'max_suction_power', 'large_particles_boost', 'pet_focused_cleaning', 'floor_direction_cleaning',
            'side_reach', 'gap_cleaning_extension', 'intelligent_recognition', 'hair_compression', 'obstacle_crossing',
            'active_suspension_crossing', 'dynamic_obstacle_cleaning'],
        select: ['low_lying_area_frequency']
    },
    mopping: {
        // custom_mopping_mode has no entity, only the attribute (types.py:1495).
        switch: ['custom_mopping_mode', 'tight_mopping', 'mop_extend', 'mopping_under_furnitures', 'wider_corner_coverage',
            'auto_change_mop', 'water_electrolysis', 'pressurized_cleaning'],
        select: ['mop_extend_frequency', 'mop_pad_swing', 'mopping_type', 'custom_mopping_route', 'mop_temperature',
            'scraper_frequency'],
        number: ['mop_cleaning_remainder']
    },
    carpet: {
        switch: ['carpet_recognition', 'carpet_avoidance', 'carpet_boost', 'intensive_carpet_cleaning', 'clean_carpets_first',
            'side_brush_carpet_rotate', 'lift_chassis_on_carpet', 'close_roller_cover_on_carpet'],
        select: ['carpet_cleaning', 'carpet_sensitivity']
    },
    station: {
        switch: ['self_clean', 'auto_dust_collecting', 'auto_water_refilling', 'auto_drying', 'auto_add_detergent', 'mop_washing_with_detergent',
            'mopping_with_detergent', 'auto_mount_mop', 'self_clean_by_zone', 'smart_drying', 'hot_washing', 'uv_sterilization',
            'ultra_clean_mode', 'smart_mop_washing', 'silent_drying', 'dust_bag_drying'],
        select: ['washing_mode', 'water_temperature', 'self_clean_frequency', 'auto_recleaning', 'auto_rewashing', 'auto_empty_mode',
            'auto_empty_frequency', 'drying_time', 'mop_wash_level', 'mop_clean_frequency'],
        number: ['self_clean_area', 'self_clean_time', 'auto_empty_area']
    },
    camera: {
        switch: ['obstacle_avoidance', 'ai_obstacle_detection', 'ai_obstacle_image_upload', 'ai_obstacle_picture', 'ai_pet_detection',
            'ai_human_detection', 'ai_furniture_detection', 'ai_fluid_detection', 'fuzzy_obstacle_detection', 'ai_pet_avoidance',
            'pet_focused_detection', 'pet_picture', 'stain_avoidance', 'collision_avoidance', 'fill_light', 'human_follow',
            'camera_light_brightness_auto'],
        number: ['camera_light_brightness']
    },
    audio: {
        switch: ['voice_assistant', 'streaming_voice_prompt'],
        select: ['voice_assistant_language'],
        number: ['volume']
    },
    dnd: {
        switch: ['dnd', 'dnd_disable_auto_empty', 'dnd_disable_resume_cleaning', 'dnd_reduce_volume'],
        time: ['dnd_start', 'dnd_end']
    },
    battery: {
        switch: ['off_peak_charging', 'auto_charging'],
        select: ['battery_charge_level'],
        time: ['off_peak_charging_start', 'off_peak_charging_end']
    },
    other: {
        switch: ['child_lock', 'multi_floor_map', 'map_saving', 'ring_light_always_on', 'lds_state'],
        select: ['selected_map', 'map_rotation', 'auto_lds_coverage']
    },
    clean: {
        switch: ['customized_cleaning', 'cleaning_sequence'],
        select: ['suction_level', 'water_volume', 'cleaning_mode', 'mop_pad_humidity', 'cleaning_route', 'mop_pressure', 'cleangenius', 'cleangenius_mode'],
        number: ['wetness_level']
    }
};

/** Ranges as `set_property_value` checks them (device.py#L2930ff), and the rows that need more than a value. */
const SETTING_EXTRA = {
    volume: { min: 0, max: 100 },
    camera_light_brightness: { min: 40, max: 100 },
    mop_cleaning_remainder: { min: 0, max: 180 },
    // 1–15 where the station washes by frequency (number.py#L166).
    wetness_level: { min: 1, max: (model) => (model.can('mop_clean_frequency') ? 15 : 32) },
    // Only while CleanGenius is on; its list stays empty otherwise (types.py#L2149).
    // Its list empties while CleanGenius may not change (types.py#L2143): say which cases.
    cleangenius: { emptyReason: 'sperre_cleangeniusListe' },
    cleangenius_mode: { shownIf: (model) => !['off', ''].includes(enumName(settingValue(model, 'cleangenius').value)) },
    auto_empty_area: { min: 5, max: 15 },
    // Rotates the robot's stored map (set_map_rotation, device.py#L6569): only after asking (R13).
    map_rotation: { options: ['0', '90', '180', '270'], confirm: true, wire: (value) => ({ key: 'map_rotation', value: Number(value) }) },
    // The floor changes through map-view's contract, with core's confirmation (CORE-20).
    selected_map: { pick: (card, model, name) => pickMap(card, model, name) },
    // With `dnd_task` the periods replace the single window (attribute `dnd` is then a list).
    dnd: { replacedBy: 'dnd_task' },
    dnd_start: { replacedBy: 'dnd_task' },
    dnd_end: { replacedBy: 'dnd_task' },
    // Automatic camera light = brightness 101 (switch.py#L548), but its own switch has no
    // write path and `value` 101 fails the 40–100 check (device.py#L2936); the setter gets
    // `params` instead (device.py#L2958). Off writes 40, as the integration's format_fn does.
    camera_light_brightness_auto: { wire: (on) => ({ key: 'camera_light_brightness', value: 40, params: on ? [101] : undefined }) }
};

/**
 * Locks the card can see coming, a subset of PROPERTY_AVAILABILITY
 * (types.py#L2022); everything else the service error reports (R12).
 */
const SETTING_NEEDS = {
    idle: ['wider_corner_coverage', 'mop_pad_swing', 'mop_extend_frequency', 'mopping_type', 'intensive_carpet_cleaning', 'side_brush_carpet_rotate',
        'clean_carpets_first', 'lift_chassis_on_carpet', 'close_roller_cover_on_carpet', 'auto_lds_coverage', 'lds_state', 'carpet_boost',
        'carpet_cleaning', 'carpet_sensitivity'],
    ai: ['ai_human_detection', 'ai_obstacle_image_upload', 'ai_obstacle_picture', 'ai_pet_detection', 'ai_furniture_detection',
        'ai_fluid_detection', 'fuzzy_obstacle_detection', 'ai_pet_avoidance', 'pet_picture', 'pet_focused_detection'],
    fluid: ['stain_avoidance'],
    carpet: ['carpet_boost', 'intensive_carpet_cleaning', 'clean_carpets_first', 'side_brush_carpet_rotate', 'lift_chassis_on_carpet',
        'close_roller_cover_on_carpet', 'carpet_cleaning', 'carpet_sensitivity'],
    dnd: ['dnd_disable_auto_empty', 'dnd_disable_resume_cleaning', 'dnd_reduce_volume'],
    manualLight: ['camera_light_brightness'],
    // Station (dock), types.py#L2101–L2245; the first failed need gives the reason.
    selfClean: ['washing_mode', 'water_temperature', 'smart_mop_washing', 'mop_wash_level', 'self_clean_frequency', 'self_clean_area', 'self_clean_time',
        'self_clean_by_zone', 'mop_clean_frequency'],
    smartWash: ['water_temperature'],
    cleanGenius: ['self_clean_frequency', 'self_clean_area', 'self_clean_time', 'self_clean_by_zone', 'mop_clean_frequency'],
    notByTime: ['self_clean_area'],
    byTime: ['self_clean_time'],
    notDrying: ['silent_drying'],
    autoDrying: ['drying_time'],
    autoEmpty: ['auto_empty_frequency']
};
SETTING_NEEDS.idle.push('self_clean_frequency', 'auto_recleaning', 'auto_rewashing');
// clean-settings (types.py#L2022–L2193): after idle and CleanGenius, the room values and the map.
SETTING_NEEDS.idle.push('customized_cleaning', 'cleaning_route', 'cleangenius', 'cleangenius_mode');
SETTING_NEEDS.cleanGenius.push('customized_cleaning', 'cleaning_mode', 'suction_level', 'water_volume', 'mop_pad_humidity', 'wetness_level', 'cleaning_route');
Object.assign(SETTING_NEEDS, {
    customized: ['suction_level', 'water_volume', 'mop_pad_humidity', 'wetness_level'],
    customizedMode: ['cleaning_mode', 'cleaning_route'],
    savedMap: ['customized_cleaning', 'cleaning_route']
});

/** Dock's tabs (DOCK-02…04), in order; a station key not named in STATION_TAB_OF washes. */
const STATION_TABS = ['wash', 'dry', 'empty'];
const STATION_TAB_OF = {
    auto_drying: 'dry', drying_time: 'dry', silent_drying: 'dry', smart_drying: 'dry', dust_bag_drying: 'dry',
    auto_dust_collecting: 'empty', auto_empty_mode: 'empty', auto_empty_frequency: 'empty', auto_empty_area: 'empty'
};

const SETTINGS = {};
for (const [group, controls] of Object.entries(SETTING_KEYS)) {
    for (const [control, keys] of Object.entries(controls)) {
        for (const key of keys) {
            SETTINGS[key] = Object.assign({ group, control, platform: control, needs: [] }, SETTING_EXTRA[key]);
            if (group === 'station') SETTINGS[key].tab = STATION_TAB_OF[key] || 'wash';
        }
    }
}
for (const [need, keys] of Object.entries(SETTING_NEEDS)) keys.forEach((key) => SETTINGS[key].needs.push(need));

/** A switch value of the attribute (true/1) or entity ('on'), else undefined. */
function toBool(value) {
    if (value === true || value === 1 || value === 'on' || value === '1' || value === 'true') return true;
    if (value === false || value === 0 || value === 'off' || value === '0' || value === 'false') return false;
    return undefined;
}

/** A value in the row's form, or undefined: switch boolean, number Number, else text. */
function normalizeSetting(control, value) {
    if (value === undefined || value === null || value === '' || UNUSABLE.includes(value)) return undefined;
    if (control === 'switch') return toBool(value);
    if (control === 'number') return Number.isFinite(Number(value)) ? Number(value) : undefined;
    return String(value);
}

const sameSetting = (control, a, b) => (control === 'select' ? enumName(a) === enumName(b) : a === b);

/** The active map camera's rotation: `map_rotation` has no attribute at the vacuum. */
function mapRotation(model) {
    const camera = model.related.maps.map[0];
    const stateObj = camera && model.hass.states[camera];
    return stateObj ? stateObj.attributes.rotation : undefined;
}

/** Current value of a key and where it came from: attribute, enabled entity, or none. */
function settingValue(model, key) {
    const def = SETTINGS[key];
    const raw = key === 'map_rotation' ? mapRotation(model) : model.attr(key);
    if (raw !== undefined) return { value: normalizeSetting(def.control, raw), source: 'attr' };
    const id = model.entity(def.platform + '.' + key);
    if (id) return { value: normalizeSetting(def.control, model.hass.states[id] && model.hass.states[id].state), source: 'entity' };
    return { value: undefined, source: null };
}

const dndActive = (model) => {
    const list = model.attr('dnd');
    return Array.isArray(list) ? list.some((d) => d && d.enabled) : settingValue(model, 'dnd').value !== false;
};

/** Each need: true when the setting may change now. Unknown counts as allowed — the service decides. */
const SETTING_LOCKS = {
    idle: (model) => !taskActive(model, model.state ? model.state.state : 'unavailable'),
    ai: (model) => settingValue(model, 'ai_obstacle_detection').value !== false,
    fluid: (model) => settingValue(model, 'ai_fluid_detection').value !== false,
    carpet: (model) => settingValue(model, 'carpet_recognition').value !== false && settingValue(model, 'carpet_avoidance').value !== true,
    dnd: dndActive,
    manualLight: (model) => settingValue(model, 'camera_light_brightness').value !== 101,
    selfClean: (model) => settingValue(model, 'self_clean').value !== false,
    smartWash: (model) => settingValue(model, 'smart_mop_washing').value !== true,
    cleanGenius: (model) => model.attr('cleangenius_cleaning') !== true,
    notByTime: (model) => !['by_time', 'intelligent'].includes(enumName(settingValue(model, 'self_clean_frequency').value)),
    byTime: (model) => enumName(settingValue(model, 'self_clean_frequency').value) === 'by_time',
    notDrying: (model) => model.attr('drying') !== true,
    autoDrying: (model) => settingValue(model, 'auto_drying').value !== false && settingValue(model, 'smart_drying').value !== true,
    autoEmpty: (model) => settingValue(model, 'auto_dust_collecting').value !== false,
    customized: (model) => model.attr('customized_cleaning') !== true,
    customizedMode: (model) => !(model.attr('customized_cleaning') === true && model.can('custom_cleaning_mode')),
    savedMap: (model) => model.attr('has_saved_map') !== false && model.attr('has_temporary_map') !== true
};

/**
 * Everything a row needs to know: present (attribute or entity, R18), value
 * (shown optimistically while a write runs), options, range, lock reason,
 * and the note of a failed write. A pending write the device confirmed ends here.
 */
function settingState(card, model, key) {
    const hass = model.hass;
    const def = SETTINGS[key];
    const current = settingValue(model, key);
    const entityId = model.entity(def.platform + '.' + key);
    const entity = entityId ? hass.states[entityId] : null;
    const pending = card._settingWrites.get(key);
    if (pending && pending.check(model)) settleWrite(card, key);
    const busy = card._settingWrites.get(key);
    const list = model.attr(key + '_list');
    let options = def.options || (Array.isArray(list) ? list : entity && Array.isArray(entity.attributes.options) ? entity.attributes.options : null);
    if (key === 'selected_map') options = (model.attr('maps') || []).map((m) => m.custom_name || m.name || String(m.id));
    const value = busy && busy.want !== undefined ? busy.want : current.value;
    const failed = def.needs.find((need) => !SETTING_LOCKS[need](model));
    const reason = failed ? translate(hass, 'sperre_' + failed)
        : def.control === 'select' && options && !options.length ? translate(hass, def.emptyReason || 'sperre_liste') : '';
    return {
        key, def, entityId, options,
        label: settingLabel(hass, key),
        present: current.source !== null && !(def.replacedBy && model.can(def.replacedBy)) && !(def.shownIf && !def.shownIf(model)),
        source: current.source,
        value,
        known: value !== undefined,
        // Ranges: the card's table, else the vacuum's `<key>_min/_max` (self_clean_area), else the entity's.
        min: def.min !== undefined ? def.min : model.attr(key + '_min') !== undefined ? model.attr(key + '_min') : entity ? entity.attributes.min : undefined,
        max: typeof def.max === 'function' ? def.max(model) : def.max !== undefined ? def.max : model.attr(key + '_max') !== undefined ? model.attr(key + '_max') : entity ? entity.attributes.max : undefined,
        step: entity && entity.attributes.step ? entity.attributes.step : 1,
        locked: !!reason,
        reason,
        busy: !!busy,
        note: card._settingNotes.get(key) || ''
    };
}

/**
 * Names from the integration's own HA translation (R26), loaded once per
 * settings view (`loadBackendTranslation`). Without it the card's dictionary
 * (`set_<key>`, only for what has no entity), else the key in words.
 */
function settingLabel(hass, key) {
    return entityLabel(hass, SETTINGS[key].platform, key);
}

/** An entity's name from the integration's HA translation, else `set_<key>` of the card, else the key in words. */
function entityLabel(hass, platform, key) {
    const id = 'component.dreame_vacuum.entity.' + platform + '.' + key + '.name';
    const fromHa = hass && typeof hass.localize === 'function' ? hass.localize(id) : '';
    if (fromHa && fromHa !== id) return fromHa;
    const own = translate(hass, 'set_' + key);
    if (own !== 'set_' + key) return own;
    const words = key.replace(/_/g, ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
}

function optionLabel(hass, key, option) {
    if (key === 'map_rotation') return option + '°';
    const id = 'component.dreame_vacuum.entity.select.' + key + '.state.' + enumName(option);
    const fromHa = hass && typeof hass.localize === 'function' ? hass.localize(id) : '';
    return fromHa && fromHa !== id ? fromHa : String(option);
}

function rerender(card) {
    if (card._dialog) card._dialog._render();
}

function settleWrite(card, key) {
    const pending = card._settingWrites.get(key);
    if (!pending) return;
    clearTimeout(pending.timer);
    card._settingWrites.delete(key);
}

/** Why a service failed, for the R12 text: HA's message, else the code. */
const errorText = (error) => String((error && (error.message || error.code)) || error || '?');

/**
 * Tracks one write until the device confirms it (`check`), or reports why not:
 * a service error at once, no confirmation after OPTIMISTIC_HOLD_MS (some
 * setters end silently). Without `check` (actions) the service's answer is the
 * confirmation; `done` runs then. A second tap while one runs is ignored (R11).
 */
function trackWrite(card, key, { want, check, call, label, done, failKey = 'schreibFehler' }) {
    if (card._settingWrites.has(key)) return false;
    card._settingNotes.delete(key);
    const pending = { want, check: check || (() => false), timer: null };
    const name = label || (SETTINGS[key] ? settingLabel(card._hass, key) : translate(card._hass, 'aenderung'));
    const fail = (text) => {
        if (card._settingWrites.get(key) !== pending) return;
        settleWrite(card, key);
        if (text) card._settingNotes.set(key, text);
        rerender(card);
    };
    if (check) pending.timer = setTimeout(() => fail(check(card._model()) ? '' : translate(card._hass, 'nichtUebernommen', { name })), OPTIMISTIC_HOLD_MS);
    card._settingWrites.set(key, pending);
    Promise.resolve(call()).then(() => {
        if (check || card._settingWrites.get(key) !== pending) return;
        if (done) done();
        fail('');
    }, (error) => fail(translate(card._hass, failKey, { name, grund: errorText(error) })));
    rerender(card);
    return true;
}

/** The one writer of a setting: `vacuum_set_property { entity_id, key, value[, params] }`. */
function writeSetting(card, key, value, params) {
    const def = SETTINGS[key];
    const want = normalizeSetting(def.control, value);
    const wire = def.wire ? def.wire(want) : { key, value: def.control === 'switch' ? (want ? 1 : 0) : value, params };
    const data = { entity_id: card._opts.entity, key: wire.key, value: wire.value };
    if (wire.params) data.params = wire.params;
    return trackWrite(card, key, {
        want,
        check: (model) => sameSetting(def.control, settingValue(model, key).value, want),
        call: () => card._hass.callService('dreame_vacuum', 'vacuum_set_property', data)
    });
}

/** `vacuum_call_action { entity_id, key[, value] }`, busy until the service answers. */
function callAction(card, key, value, { track = key, label, done, failKey } = {}) {
    const data = { entity_id: card._opts.entity, key };
    if (value !== undefined) data.value = String(value);
    return trackWrite(card, track, { label, done, failKey, call: () => card._hass.callService('dreame_vacuum', 'vacuum_call_action', data) });
}

function pickMap(card, model, name) {
    const entry = (model.attr('maps') || []).find((m) => (m.custom_name || m.name || String(m.id)) === name);
    if (!entry) return false;
    if (card._map) return card._map.selectMap(entry.id);
    card._confirmMapChange(name, () => card._hass.callService('dreame_vacuum', 'vacuum_select_map', { entity_id: card._opts.entity, map_id: entry.id }));
    return true;
}

/** A setting that changes something lasting asks first, naming the new value (R13). */
function confirmSetting(card, key, value) {
    const hass = card._hass;
    const view = {
        title: translate(hass, 'bestaetigenTitel', { name: settingLabel(hass, key) }),
        kind: 'confirm',
        render: (body, h, dialog) => {
            body.appendChild(noteLine(translate(h, 'frage_' + key, { wert: optionLabel(h, key, value) })));
            const actions = document.createElement('div');
            actions.className = 'actions';
            const cancel = BuschUI.action({ label: translate(h, 'abbrechen'), text: translate(h, 'abbrechen'), onClick: () => dialog._goBack() });
            cancel.setAttribute('data-action', 'cancel');
            const go = BuschUI.action({ label: translate(h, 'aendern'), text: translate(h, 'aendern'), variant: 'primary', onClick: () => {
                writeSetting(card, key, value);
                dialog._goBack();
            } });
            go.setAttribute('data-action', 'confirm');
            actions.append(cancel, go);
            body.appendChild(actions);
        }
    };
    if (card._dialog && card._dialog.isConnected) card._dialog.show(view);
    else card._openDialog(view);
    return true;
}

/** Status line under a setting's name: always words, never colour alone (R17). */
function settingStatus(hass, s) {
    if (s.busy) return ['busy', translate(hass, 'speichert')];
    if (s.note) return ['error', s.note];
    if (s.locked) return ['locked', s.reason];
    if (!s.known) return ['unknown', translate(hass, 'wertUnbekannt')];
    return ['ok', ''];
}

/**
 * The one settings row (switch / select / number / time), or null when the
 * device lacks the key. Used by device-settings, dock and clean-settings.
 */
function settingRow(card, model, key) {
    const hass = card._hass;
    const s = settingState(card, model, key);
    if (!s.present) return null;
    const row = document.createElement('div');
    row.className = 'setting';
    row.setAttribute('data-setting', key);
    const text = document.createElement('div');
    text.className = 'setting-text';
    const name = document.createElement('span');
    name.className = 'setting-name';
    name.id = 'setting-' + key;
    name.textContent = s.label;
    const status = document.createElement('span');
    status.className = 'setting-status';
    status.id = 'setting-status-' + key;
    const [state, words] = settingStatus(hass, s);
    text.append(name, status);
    row.appendChild(text);
    const blocked = s.locked || s.busy;
    const write = (value) => {
        if (s.def.pick) return s.def.pick(card, model, value);
        if (s.def.confirm) return confirmSetting(card, key, value);
        return writeSetting(card, key, value);
    };
    const describe = (node) => {
        node.setAttribute('aria-labelledby', name.id);
        node.setAttribute('aria-describedby', status.id);
        if (s.busy) node.setAttribute('aria-busy', 'true');
        if (blocked) node.disabled = true;
        return node;
    };
    const control = s.def.control;
    if (control === 'switch' && s.known) {
        const word = translate(hass, s.value ? 'an' : 'aus');
        const toggle = describe(BuschUI.action({ label: s.label, text: word, variant: s.value ? 'primary' : 'secondary', onClick: () => write(!s.value) }));
        toggle.classList.add('setting-switch');
        toggle.setAttribute('role', 'switch');
        toggle.setAttribute('aria-checked', String(!!s.value));
        row.appendChild(toggle);
    } else if (control === 'switch') {
        // Unknown stays unknown (spec: never guess): both ways offered.
        const pair = document.createElement('div');
        pair.className = 'setting-pair';
        for (const [word, value] of [['an', true], ['aus', false]]) {
            const button = describe(BuschUI.action({ label: s.label + ': ' + translate(hass, word), text: translate(hass, word), onClick: () => write(value) }));
            button.setAttribute('data-action', word === 'an' ? 'on' : 'off');
            pair.appendChild(button);
        }
        row.appendChild(pair);
    } else if (control === 'select') {
        const select = describe(document.createElement('select'));
        select.className = 'setting-select';
        const options = (s.options || []).map(String);
        if (!s.known || !options.some((o) => sameSetting('select', o, s.value))) {
            const unknown = document.createElement('option');
            unknown.value = '';
            unknown.disabled = true;
            unknown.textContent = s.known ? String(s.value) : translate(hass, 'wertUnbekannt');
            select.appendChild(unknown);
        }
        for (const option of options) {
            const node = document.createElement('option');
            node.value = option;
            node.textContent = optionLabel(hass, key, option);
            select.appendChild(node);
        }
        select.value = options.find((o) => sameSetting('select', o, s.value)) || '';
        select.addEventListener('change', () => { if (select.value) write(select.value); });
        row.appendChild(select);
    } else {
        const input = describe(document.createElement('input'));
        input.className = 'setting-input';
        input.setAttribute('type', control === 'time' ? 'time' : 'number');
        if (control === 'number') {
            if (s.min !== undefined) input.setAttribute('min', String(s.min));
            if (s.max !== undefined) input.setAttribute('max', String(s.max));
            input.setAttribute('step', String(s.step));
            input.setAttribute('inputmode', 'numeric');
        }
        input.value = s.known ? String(s.value) : '';
        input.addEventListener('change', () => {
            if (control === 'time') {
                if (/^([01]\d|2[0-3]):[0-5]\d$/.test(input.value)) write(input.value);
                return;
            }
            const number = Number(input.value);
            if (input.value === '' || !Number.isFinite(number) || (s.min !== undefined && number < s.min) || (s.max !== undefined && number > s.max)) {
                card._settingNotes.set(key, translate(hass, 'bereich', { min: s.min, max: s.max }));
                rerender(card);
                return;
            }
            write(number);
        });
        row.appendChild(input);
    }
    row.setAttribute('data-state', state);
    status.textContent = words;
    return row;
}

// ---------------------------------------------------------------------------
// Map data and geometry (map-view, pure functions)
// ---------------------------------------------------------------------------

/**
 * Map data of `/api/camera_map_data_proxy/<camera>` (dreame_vacuum 2.0.3,
 * map.py get_data) → one grid. `data` holds per pixel type flat run lengths
 * [x, y, count, …]; `size` = [left, top, original_left, original_top, width,
 * height, grid_size, rotation, crop, visible_crop]. Grid cell (gx, gy) covers
 * robot x ∈ [left + gx·grid, +grid), y ∈ [top + gy·grid, +grid). Type 512 is
 * the carpet layer on top of the room pixels. Null for an empty map or junk.
 */
function decodeMapData(raw) {
    if (!raw || raw.empty_map || !Array.isArray(raw.size) || !raw.data || typeof raw.data !== 'object') return null;
    const [left, top, , , width, height, grid, rotation] = raw.size.map(Number);
    if (![left, top, width, height, grid].every(Number.isFinite) || width < 1 || height < 1 || grid <= 0 || width * height > 4e6) return null;
    const cells = new Uint8Array(width * height);
    const carpet = new Uint8Array(width * height);
    for (const [key, runs] of Object.entries(raw.data)) {
        const type = Number(key);
        if (!Array.isArray(runs) || !(type > 0)) continue;
        const target = type === 512 ? carpet : cells;
        const value = type === 512 ? 1 : type;
        if (value > 255) continue;
        for (let i = 0; i + 2 < runs.length; i += 3) {
            const x = runs[i], y = runs[i + 1], n = runs[i + 2];
            if (y < 0 || y >= height || x < 0) continue;
            target.fill(value, y * width + x, y * width + Math.min(width, x + n));
        }
    }
    return { left, top, width, height, grid, rotation: Number(rotation) || 0, crop: raw.size[8] || [0, 0, 0, 0], cells, carpet };
}

/** Pixel type under a robot point (mm), or 0 outside the grid. */
function cellAt(map, p) {
    if (!map || !p) return 0;
    const gx = Math.floor((p.x - map.left) / map.grid), gy = Math.floor((p.y - map.top) / map.grid);
    return gx < 0 || gy < 0 || gx >= map.width || gy >= map.height ? 0 : map.cells[gy * map.width + gx];
}

/** Room of a pixel type: 1–99 the room itself, 101–199 its edge, 201–248 its border (types.py, map.py L4590). */
function roomOfCell(value) {
    if (value >= 1 && value < 100) return value;
    if (value > 100 && value < 200) return value - 100;
    if (value > 200 && value < 249) return value - 200;
    return null;
}

/** Data mode: the exact room under a robot point. */
function roomAtGrid(map, p) {
    return map ? roomOfCell(cellAt(map, p)) : null;
}

/** Floor the robot can reach: rooms, floor, new segment, cleaned/dirty area (MapPixelType). */
function passableGrid(map, p) {
    if (!map) return null;
    const value = cellAt(map, p);
    return roomOfCell(value) !== null || [249, 250, 253, 254].includes(value);
}

/**
 * Image mode fallback: rooms carry only a rectangle and a centre, and the
 * rectangles overlap. Among the rectangles holding the point, the nearest centre.
 */
function roomAtRects(rooms, p) {
    let best = null;
    let distance = Infinity;
    for (const room of Object.values(rooms || {})) {
        if (!room || !(p.x >= room.x0 && p.x <= room.x1 && p.y >= room.y0 && p.y <= room.y1)) continue;
        const d = (p.x - room.x) ** 2 + (p.y - room.y) ** 2;
        if (d < distance) { distance = d; best = Number(room.room_id); }
    }
    return best;
}

/*
 * Affine maps as CSS matrix(a, b, c, d, e, f): (x, y) → (a·x + c·y + e, b·x + d·y + f).
 * Robot mm → image px comes from the camera's calibration_points (or the data
 * grid), image px → stage px from zoom, pan and the map's display settings.
 */
const IDENTITY = Object.freeze({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });

function applyAffine(m, p) {
    return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}

/** m ∘ n: n first, then m. */
function multiplyAffine(m, n) {
    return {
        a: m.a * n.a + m.c * n.b, b: m.b * n.a + m.d * n.b,
        c: m.a * n.c + m.c * n.d, d: m.b * n.c + m.d * n.d,
        e: m.a * n.e + m.c * n.f + m.e, f: m.b * n.e + m.d * n.f + m.f
    };
}

function invertAffine(m) {
    const det = m ? m.a * m.d - m.b * m.c : 0;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
    return { a: m.d / det, b: -m.b / det, c: -m.c / det, d: m.a / det, e: (m.c * m.f - m.d * m.e) / det, f: (m.b * m.e - m.a * m.f) / det };
}

/**
 * Robot mm → image px from three calibration pairs (map.py L7916): solved as
 * an equation system, so any device rotation and any three points work.
 */
function affineFrom(points) {
    if (!Array.isArray(points) || points.length < 3) return null;
    const pts = points.slice(0, 3).map((p) => p && p.vacuum && p.map ? [p.vacuum.x, p.vacuum.y, p.map.x, p.map.y].map(Number) : [NaN]);
    if (!pts.every((p) => p.length === 4 && p.every(Number.isFinite))) return null;
    const [[x0, y0], [x1, y1], [x2, y2]] = pts;
    const det = x0 * (y1 - y2) + x1 * (y2 - y0) + x2 * (y0 - y1);
    if (Math.abs(det) < 1e-9) return null;
    const solve = (v0, v1, v2) => [
        (v0 * (y1 - y2) + v1 * (y2 - y0) + v2 * (y0 - y1)) / det,
        (v0 * (x2 - x1) + v1 * (x0 - x2) + v2 * (x1 - x0)) / det,
        (v0 * (x1 * y2 - x2 * y1) + v1 * (x2 * y0 - x0 * y2) + v2 * (x0 * y1 - x1 * y0)) / det
    ];
    const [a, c, e] = solve(pts[0][2], pts[1][2], pts[2][2]);
    const [b, d, f] = solve(pts[0][3], pts[1][3], pts[2][3]);
    const m = { a, b, c, d, e, f };
    return invertAffine(m) ? m : null;
}

/** Clockwise quarter turns as (x, y) → rotated frame of a w × h box, with the new size. */
function quarterTurn(rotation, w, h) {
    switch (((Number(rotation) % 360) + 360) % 360) {
        case 90: return { m: { a: 0, b: 1, c: -1, d: 0, e: h, f: 0 }, w: h, h: w };
        case 180: return { m: { a: -1, b: 0, c: 0, d: -1, e: w, f: h }, w, h };
        case 270: return { m: { a: 0, b: -1, c: 1, d: 0, e: 0, f: w }, w: h, h: w };
        default: return { m: IDENTITY, w, h };
    }
}

/**
 * Data mode: robot mm → canvas px, one px per grid cell, y flipped, minus the
 * crop of get_data, turned like types.py Point.rotated ((x, y) → (y, w − x) per 90°).
 */
function gridAffine(map) {
    const crop = Array.isArray(map.crop) ? map.crop.map((v) => Number(v) || 0) : [0, 0, 0, 0];
    let w = map.width - crop[0] - crop[2];
    let h = map.height - crop[1] - crop[3];
    let matrix = { a: 1 / map.grid, b: 0, c: 0, d: -1 / map.grid, e: -map.left / map.grid - crop[0], f: map.height + map.top / map.grid - crop[1] };
    for (let turn = ((map.rotation % 360) + 360) % 360; turn > 0; turn -= 90) {
        matrix = multiplyAffine({ a: 0, b: -1, c: 1, d: 0, e: 0, f: w }, matrix);
        [w, h] = [h, w];
    }
    return { matrix, width: w, height: h };
}

/**
 * Image px → stage px: the map turned clockwise by `rotation` (map_config),
 * cut to `crop` (percent of the turned frame), fitted into the stage, times
 * `scale` and `zoom`, centred, then moved by the pan.
 */
function viewMatrix({ width, height, stageWidth, stageHeight, rotation = 0, scale = 1, zoom = 1, panX = 0, panY = 0, crop }) {
    const turn = quarterTurn(rotation, width, height);
    const cut = crop || {};
    const pct = (v) => Math.min(95, Math.max(0, Number(v) || 0)) / 100;
    const x0 = turn.w * pct(cut.left), x1 = turn.w * (1 - pct(cut.right));
    const y0 = turn.h * pct(cut.top), y1 = turn.h * (1 - pct(cut.bottom));
    const fit = stageWidth > 0 && stageHeight > 0 && x1 > x0 && y1 > y0 ? Math.min(stageWidth / (x1 - x0), stageHeight / (y1 - y0)) : 1;
    const k = fit * (Number(scale) > 0 ? Number(scale) : 1) * zoom;
    const place = { a: k, b: 0, c: 0, d: k, e: stageWidth / 2 + panX - k * (x0 + x1) / 2, f: stageHeight / 2 + panY - k * (y0 + y1) / 2 };
    return multiplyAffine(place, turn.m);
}

// ---------------------------------------------------------------------------
// Status and control (CORE-03/04/07/11)
// ---------------------------------------------------------------------------

/** How long a tapped target state is shown before the device has to confirm it. */
const OPTIMISTIC_HOLD_MS = 5000;

/** Control buttons: the can() name each needs, its vacuum service and the state it leads to. */
const CONTROLS = {
    start: { feature: 'start', service: 'start', target: 'cleaning', icon: 'mdi:play', variant: 'primary' },
    resume: { feature: 'start', service: 'start', target: 'cleaning', icon: 'mdi:play', variant: 'primary' },
    pause: { feature: 'pause', service: 'pause', target: 'paused', icon: 'mdi:pause' },
    stop: { feature: 'stop', service: 'stop', target: 'idle', icon: 'mdi:stop' },
    return: { feature: 'return_home', service: 'return_to_base', target: 'returning', icon: 'mdi:home-import-outline' }
};

const CONTROLS_BY_STATE = {
    docked: ['start'],
    idle: ['start', 'return'],
    cleaning: ['pause', 'stop', 'return'],
    paused: ['resume', 'stop', 'return'],
    returning: ['pause', 'stop'],
    error: ['start', 'return']
};

function controlsFor(model, state) {
    let names = CONTROLS_BY_STATE[state] || [];
    // Stop also ends what the dock is doing.
    if (state === 'docked' && (model.attr('washing') || model.attr('drying'))) names = names.concat('stop');
    // Idle outside the dock (e.g. after station cleaning, which does not re-dock): return comes first.
    if (state === 'idle' && model.attr('docked') === false) names = ['return', 'start'];
    return names.filter((name) => model.can(CONTROLS[name].feature));
}

const UNUSABLE = ['unavailable', 'unknown'];

/** Home Assistant's own text for a state: translated, with the entity's unit. */
function formatState(hass, stateObj, state) {
    if (hass && typeof hass.formatEntityState === 'function') return hass.formatEntityState(stateObj, state);
    const unit = stateObj.attributes.unit_of_measurement;
    return (state || stateObj.state) + (unit ? ' ' + unit : '');
}

/** A value from the device's sensor (HA units), else from the vacuum attribute. */
function statText(hass, model, key, attribute, unit) {
    const id = model.entity(key);
    const sensor = id && hass.states[id];
    if (sensor && !UNUSABLE.includes(sensor.state)) return formatState(hass, sensor);
    const value = model.attr(attribute);
    return value === undefined || value === null || value === '' ? null : value + ' ' + unit;
}

function batteryInfo(hass, model) {
    const id = model.entity('sensor.battery_level');
    const sensor = id && hass.states[id] && !UNUSABLE.includes(hass.states[id].state) ? hass.states[id] : null;
    const raw = sensor ? sensor.state : (model.attr('battery_level') !== undefined ? model.attr('battery_level') : model.attr('battery'));
    const level = Number(raw);
    if (raw === undefined || raw === null || raw === '' || !Number.isFinite(level)) return null;
    const binary = model.entity('binary_sensor.charging_state');
    const charging = model.attr('charging') === true || !!(binary && hass.states[binary] && hass.states[binary].state === 'on');
    // cleaning_paused: back at the dock mid-task, charging to resume.
    const kind = charging && model.attr('cleaning_paused') ? 'paused' : charging ? 'charging' : level <= 20 ? 'low' : 'normal';
    const tens = Math.min(100, Math.max(0, Math.floor(level / 10) * 10));
    const icon = kind === 'paused' ? 'mdi:battery-clock'
        : kind === 'low' ? 'mdi:battery-alert-variant-outline'
        : kind === 'charging' ? (tens ? 'mdi:battery-charging-' + tens : 'mdi:battery-charging-outline')
        : tens === 100 ? 'mdi:battery' : tens ? 'mdi:battery-' + tens : 'mdi:battery-outline';
    const text = sensor ? formatState(hass, sensor) : Math.round(level) + ' %';
    const word = { paused: 'akkuPause', charging: 'akkuLaedt', low: 'akkuNiedrig' }[kind];
    return { kind, icon, text: word ? text + ' · ' + translate(hass, word) : text };
}

/** Station findings, errors first: [attribute, value, level, text key]. */
const DOCK_CHECKS = [
    ['clean_water_tank_status', 'not_installed', 'error', 'frischwasserFehlt'],
    ['dirty_water_tank_status', 'not_installed_or_full', 'error', 'schmutzwasser'],
    ['dust_bag_status', 'not_installed', 'error', 'staubbeutelFehlt'],
    ['station_drainage_status', 'draining_failed', 'error', 'ablaufFehler'],
    ['clean_water_tank_status', 'low_water', 'warning', 'frischwasserNiedrig'],
    ['dust_bag_status', 'check', 'warning', 'staubbeutelPruefen'],
    ['detergent_status', 'low_detergent', 'warning', 'reinigungsmittelNiedrig']
];

// The attributes carry display strings ("Low water"); the sensors the enum names.
const enumName = (value) => String(value === undefined || value === null ? '' : value).trim().toLowerCase().replace(/[\s-]+/g, '_');

function dockStatus(model) {
    const hit = DOCK_CHECKS.find(([attribute, value]) => enumName(model.attr(attribute)) === value);
    return hit ? { level: hit[2], key: hit[3] } : { level: 'ok', key: null };
}

/** Station values (DOCK-06, ALL-04/05 display): attribute, else the sensor (also for disabled sensors). */
const STATION_VALUES = ['clean_water_tank_status', 'dirty_water_tank_status', 'dust_bag_status', 'detergent_status', 'hot_water_status',
    'station_drainage_status', 'self_wash_base_status', 'auto_empty_status', 'low_water_warning', 'dust_collection', 'drying_left', 'drying_progress'];
/** Station flags of the vacuum; the first three are something running. */
const STATION_FLAGS = ['washing', 'washing_paused', 'drying', 'draining_available', 'washing_available', 'drying_available', 'dust_collection_available'];
const LEVEL_ICON = { error: 'mdi:alert-circle-outline', warning: 'mdi:alert-outline', info: 'mdi:progress-clock', ok: 'mdi:check-circle-outline' };
const LEVEL_ORDER = ['error', 'warning', 'info', 'ok'];

/**
 * The whole station status (DOCK-06): [{ key, level, label, text, icon }],
 * problems first. Levels as dockStatus judges them; text in HA's words when
 * the sensor says the same (R17: symbol and text, never colour alone).
 */
function stationStatus(model) {
    if (!model.can('dock')) return [];
    const hass = model.hass;
    const list = [];
    for (const key of STATION_VALUES) {
        const id = model.entity('sensor.' + key);
        const sensor = id && hass.states[id] && !UNUSABLE.includes(hass.states[id].state) ? hass.states[id] : null;
        const raw = model.attr(key);
        const has = raw !== undefined && raw !== null && raw !== '';
        if (!has && !sensor) continue;
        const name = enumName(has ? raw : sensor.state);
        const check = DOCK_CHECKS.find(([attribute, value]) => attribute === key && value === name);
        const level = check ? check[2] : key === 'low_water_warning' && name !== 'no_warning' ? 'warning' : 'ok';
        const text = sensor && enumName(sensor.state) === name ? formatState(hass, sensor) : String(raw);
        list.push({ key, level, label: entityLabel(hass, 'sensor', key), text, icon: LEVEL_ICON[level] });
    }
    for (const key of STATION_FLAGS) {
        const raw = model.attr(key);
        if (typeof raw !== 'boolean') continue;
        const level = raw && STATION_FLAGS.indexOf(key) < 3 ? 'info' : 'ok';
        list.push({ key, level, label: translate(hass, 'status_' + key), text: translate(hass, raw ? 'ja' : 'nein'), icon: LEVEL_ICON[level] });
    }
    return list.sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level));
}

// ---------------------------------------------------------------------------
// Task type, messages, progress (CORE-06/09/10)
// ---------------------------------------------------------------------------

/** Task types in order; `needs` are can() names. Map types work once map-view exists. */
const TASK_TYPES = [
    { name: 'all', text: 'taskAll', icon: 'mdi:home-outline', needs: [] },
    { name: 'room', text: 'taskRoom', icon: 'mdi:floor-plan', needs: ['map', 'dreame_vacuum.vacuum_clean_segment'], map: true },
    { name: 'zone', text: 'taskZone', icon: 'mdi:select-drag', needs: ['map', 'dreame_vacuum.vacuum_clean_zone'], map: true },
    { name: 'spot', text: 'taskSpot', icon: 'mdi:target', needs: ['map', 'dreame_vacuum.vacuum_clean_spot'], map: true },
    { name: 'goto', text: 'taskGoto', icon: 'mdi:map-marker-outline', needs: ['map', 'dreame_vacuum.vacuum_goto'], map: true }
];

const tasksFor = (model) => TASK_TYPES.filter((t) => t.needs.every((n) => model.can(n)));

/** A task is under way — also paused or charging mid-task (`started`). */
function taskActive(model, shown) {
    const started = model.attr('started');
    return typeof started === 'boolean' ? started || ['cleaning', 'paused'].includes(shown) : ['cleaning', 'paused'].includes(shown);
}

function runningTask(model) {
    // Go-To: native as cruising point (task_status), simulated as a small zone with a cruise point.
    if (/cruising_point/i.test(String(model.attr('task_status') || '')) || cameraAttrs(model).active_cruise_points) return 'goto';
    if (model.attr('segment_cleaning')) return 'room';
    if (model.attr('zone_cleaning')) return 'zone';
    if (model.attr('spot_cleaning')) return 'spot';
    return 'all';
}

// ---------------------------------------------------------------------------
// Tasks (clean-tasks): one selection model in robot mm for map, chips and
// lists (R08); payload and checks are pure functions (testable without DOM)
// ---------------------------------------------------------------------------

const TASK_SERVICES = { room: 'vacuum_clean_segment', zone: 'vacuum_clean_zone', spot: 'vacuum_clean_spot', goto: 'vacuum_goto' };
const GRID_MM = 50; // grid_size when the map data is missing (device.py: size 100 = 2 × 50)
const emptySelection = () => ({ rooms: [], zones: [], spots: [], goto: null });

/** Attributes of the vacuum's active map camera, or {}. */
function cameraAttrs(model) {
    const id = model.related.maps.map[0];
    const cam = id && model.hass && model.hass.states[id];
    return (cam && cam.attributes) || {};
}

/** The vacuum's own room list of the selected map ({ "Karte 1": [{ id, name, icon }] }) as camera-like rooms. */
function vacuumRooms(model) {
    const all = model.attr('rooms');
    if (!all || typeof all !== 'object') return {};
    const list = all[model.attr('selected_map')] || Object.values(all)[0] || [];
    return Object.fromEntries((Array.isArray(list) ? list : []).filter((r) => r && r.id !== undefined).map((r) => [String(r.id), { room_id: r.id, name: r.name, icon: r.icon }]));
}

/** A zone with sorted, whole robot mm: [x0, y0, x1, y1] as the service wants it. */
const zoneBox = (z) => [Math.round(Math.min(z.x0, z.x1)), Math.round(Math.min(z.y0, z.y1)), Math.round(Math.max(z.x0, z.x1)), Math.round(Math.max(z.y0, z.y1))];

/**
 * The one service call of a task (spec table): `{ domain, service, data }`
 * without entity_id. With Customized Cleaning the room values go along as
 * lists in selection order; otherwise the service would set repeats=1 for all
 * rooms (vacuum.py#L1123 → device.py#L4910).
 */
function taskPayload(model, task, selection, repeats) {
    const n = Math.min(3, Math.max(1, Number(repeats) || 1));
    if (task === 'room') {
        const segments = selection.rooms.slice();
        if (model.attr('customized_cleaning') !== true) return { domain: 'dreame_vacuum', service: TASK_SERVICES.room, data: { segments, repeats: n } };
        const rooms = cameraAttrs(model).rooms || {};
        const list = (key, fallback) => segments.map((id) => { const v = rooms[id] && rooms[id][key]; return v === undefined || v === null ? fallback : Number(v); });
        return { domain: 'dreame_vacuum', service: TASK_SERVICES.room, data: { segments, repeats: list('cleaning_times', 1), suction_level: list('suction_level', 0), water_volume: list('water_volume', 0) } };
    }
    if (task === 'zone') return { domain: 'dreame_vacuum', service: TASK_SERVICES.zone, data: { zone: selection.zones.map(zoneBox), repeats: selection.zones.map(() => n) } };
    if (task === 'spot') return { domain: 'dreame_vacuum', service: TASK_SERVICES.spot, data: { points: selection.spots.map((p) => [Math.round(p.x), Math.round(p.y)]), repeats: selection.spots.map(() => n) } };
    if (task === 'goto') return { domain: 'dreame_vacuum', service: TASK_SERVICES.goto, data: { x: Math.round(selection.goto.x), y: Math.round(selection.goto.y) } };
    return { domain: 'vacuum', service: 'start', data: {} };
}

/** Nine sample points of a zone: corners, edge centres, centre. */
const zoneSamples = (z) => [0, 0.5, 1].flatMap((fx) => [0, 0.5, 1].map((fy) => ({ x: z.x0 + (z.x1 - z.x0) * fx, y: z.y0 + (z.y1 - z.y0) * fy })));

/**
 * Whether a task can start, else the dictionary key of why (R12). What the
 * integration would refuse is caught here first (device.py#L4771, L4895,
 * L4996, L5099, L4831, L5050, L5150). `map`: `{ passable(p), grid }`;
 * passable blocks only on false (image mode answers null).
 */
function taskReady(model, task, selection, map) {
    const no = (reason) => ({ ok: false, reason });
    if (task === 'all' || !TASK_SERVICES[task]) return { ok: true, reason: null };
    if (model.attr('draining') === true || model.attr('self_repairing') === true) return no('sperreAblassenAufgabe');
    const grid = (map && map.grid) || GRID_MM;
    const blocked = (p) => !!map && map.passable(p) === false;
    if (task === 'room') {
        if (model.attr('has_saved_map') === false) return no('raumOhneKarte');
        return selection.rooms.length ? { ok: true, reason: null } : no('leerRaum');
    }
    if (task === 'zone') {
        if (!selection.zones.length) return no('leerZone');
        // The device needs each side longer than 2 × grid_size (w <= 1.0 fails).
        if (selection.zones.some((z) => Math.abs(z.x1 - z.x0) <= 2 * grid || Math.abs(z.y1 - z.y0) <= 2 * grid)) return no('zoneZuKlein');
        if (selection.zones.some((z) => zoneSamples(z).every(blocked))) return no('zoneAusserhalb');
        return { ok: true, reason: null };
    }
    if (task === 'spot') {
        if (!selection.spots.length) return no('leerSpot');
        return selection.spots.some(blocked) ? no('punktAusserhalb') : { ok: true, reason: null };
    }
    const target = selection.goto;
    if (!target) return no('leerGoto');
    if (blocked(target)) return no('punktAusserhalb');
    const robot = cameraAttrs(model).vacuum_position;
    // Only the simulated way (a small zone) refuses a target next to the robot.
    if (!model.can('cruising') && robot && Math.abs(target.x - robot.x) <= 2 * grid && Math.abs(target.y - robot.y) <= 2 * grid) return no('gotoAmRoboter');
    return { ok: true, reason: null };
}

const TASK_MAP_MODES = { room: 'pick-room', zone: 'draw-rect', spot: 'pick-point', goto: 'pick-point' };
const SPOT_MM = 1500; // a spot cleans 1.5 × 1.5 m around its point (vacuum.py#L1135)

/** Corners of a robot-mm rectangle as an image-px points string. */
const boxPoints = (ctx, z) => [[z.x0, z.y0], [z.x1, z.y0], [z.x1, z.y1], [z.x0, z.y1]].map(([x, y]) => ctx.toImage({ x, y })).map((p) => p.x + ',' + p.y).join(' ');
const spotBox = (p) => ({ x0: p.x - SPOT_MM / 2, y0: p.y - SPOT_MM / 2, x1: p.x + SPOT_MM / 2, y1: p.y + SPOT_MM / 2 });

const HANDLE_PX = 22; // half of a 44-px touch target (R06)

function insidePolygon(p, corners) {
    let inside = false;
    for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
        const a = corners[i], b = corners[j];
        if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
}

/** The smallest shown carpet or furniture under a robot point as a rectangle, or null (zone from an object). */
function outlineAt(view, p) {
    const ctx = view._ctx();
    const shapes = [];
    for (const name of ['carpets', 'detected_carpets']) if (view.visible(name)) for (const item of ctx.objects[name] || []) shapes.push(areaCorners(item));
    if (view.visible('furnitures')) for (const f of MAP_DRAW.furniture.source(view, 'furnitures', ctx)) shapes.push(furnitureCorners(f));
    const boxes = shapes.filter((c) => insidePolygon(p, c)).map((c) => {
        const xs = c.map((q) => q.x), ys = c.map((q) => q.y);
        return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    });
    boxes.sort((a, b) => (a.x1 - a.x0) * (a.y1 - a.y0) - (b.x1 - b.x0) * (b.y1 - b.y0));
    return boxes[0] || null;
}

/** A screen-sized group at a robot point (like the map's symbols). */
function screenMark(ctx, robot, attrs) {
    const p = ctx.toImage(robot);
    const g = ctx.svgNode('g', attrs);
    g.style.transform = 'translate(' + p.x + 'px, ' + p.y + 'px) scale(var(--bvc-map-symbol)) rotate(var(--bvc-map-turn))';
    return g;
}

/**
 * The layer `tasks`: while a task runs, its targets from active_* (spec
 * types.py#L5011–L5026); otherwise the card's own selection.
 */
function drawTasks(card, group, ctx) {
    const model = ctx.model;
    if (taskActive(model, model.state ? model.state.state : 'unavailable')) {
        const a = ctx.objects;
        for (const item of a.active_areas || []) group.appendChild(ctx.svgNode('polygon', { 'data-active': 'area', points: toPoints({ toImage: ctx.toImage }, areaCorners(item)) }));
        for (const p of a.active_points || []) group.appendChild(ctx.svgNode('polygon', { 'data-active': 'point', points: boxPoints(ctx, spotBox(p)) }));
        for (const id of a.active_segments || []) {
            const room = ctx.rooms[id];
            if (room && room.x !== undefined) group.appendChild(screenMark(ctx, room, { 'data-active': 'segment', 'data-room': id })).appendChild(ctx.svgNode('circle', { r: 9 }));
        }
        for (const p of Object.values(a.active_cruise_points || {})) if (p) group.appendChild(screenMark(ctx, p, { 'data-active': 'cruise' })).appendChild(ctx.svgNode('path', { d: 'M0 -12 L8 0 L0 12 L-8 0 Z' }));
        return;
    }
    if (card._drawSelection) card._drawSelection(group, ctx);
}

/** Taps on the layer: the task types' own targets (handles, ×), else nothing. */
function hitTasks(card, point, ctx) {
    return card._hitSelection ? card._hitSelection(point, ctx) : null;
}

const MESSAGE_LOOK = {
    error: { word: 'stufeError', icon: 'mdi:alert-circle-outline' },
    warning: { word: 'stufeWarning', icon: 'mdi:alert-outline' },
    low_water: { word: 'stufeLowWater', icon: 'mdi:water-alert-outline' },
    info: { word: 'stufeInfo', icon: 'mdi:information-outline' }
};

/** Current messages [{ kind, text }]: error or warning (one code), low water, info. */
function messagesFor(hass, model) {
    const list = [];
    const id = model.entity('sensor.error');
    const sensor = id && hass.states[id];
    // The sensor carries HA's translated description; the attribute only English.
    const fromSensor = sensor && !UNUSABLE.includes(sensor.state) && enumName(sensor.state) !== 'no_error' ? (sensor.attributes.description || formatState(hass, sensor)) : null;
    const raw = model.attr('error');
    const text = fromSensor || (raw && enumName(raw) !== 'no_error' ? String(raw) : null);
    if (text) list.push({ kind: model.attr('has_error') ? 'error' : 'warning', text });
    const low = model.attr('low_water_warning');
    const lowText = low && enumName(low) !== 'no_warning' ? String(low) : '';
    if (model.attr('low_water') === true || lowText) list.push({ kind: 'low_water', text: lowText });
    if (model.attr('cleaning_paused')) list.push({ kind: 'info', text: translate(hass, 'infoPausiert') });
    return list;
}

/** Cleaning progress in percent from the sensor (else the attribute), or null. */
function progressOf(hass, model) {
    const id = model.entity('sensor.cleaning_progress');
    const sensor = id && hass.states[id];
    const raw = sensor && !UNUSABLE.includes(sensor.state) ? sensor.state : model.attr('cleaning_progress');
    const value = Number(raw);
    return raw === undefined || raw === null || raw === '' || !Number.isFinite(value) ? null : Math.min(100, Math.max(0, value));
}

/**
 * Main menu (CORE-05) in the reference's order: can() name, and the module
 * that fills the entry's view. Locate acts at once.
 */
const MENU = [
    { name: 'locate', text: 'entryLocate', icon: 'mdi:map-marker-radius-outline', needs: 'locate' },
    { name: 'history', text: 'entryHistory', icon: 'mdi:history', needs: 'history', module: 'history' },
    { name: 'cruising_history', text: 'entryCruising', icon: 'mdi:map-marker-path', needs: 'cruising_history', module: 'history' },
    { name: 'consumables', text: 'entryConsumables', icon: 'mdi:wrench-clock', needs: 'consumables', module: 'device-settings' },
    { name: 'cleaning_sequence', text: 'entrySequence', icon: 'mdi:sort-numeric-ascending', needs: 'cleangenius', module: 'clean-settings' },
    { name: 'remote', text: 'entryRemote', icon: 'mdi:gamepad-round-outline', needs: 'remote', module: 'remote' },
    { name: 'maps', text: 'entryMaps', icon: 'mdi:layers-outline', needs: 'multi_floor_map', module: 'map-editor' },
    { name: 'settings', text: 'entrySettings', icon: 'mdi:cog-outline', needs: 'settings', module: 'device-settings' }
];

const menuFor = (model) => MENU.filter((entry) => model.can(entry.needs));

/** The entities a render reads; Home Assistant replaces a state object on every change. */
function watchSnapshot(hass, ids) {
    return { language: BuschUI.language(hass, { legacy: true }), dark: darkMode(hass), ids, objects: ids.map((id) => hass.states[id]) };
}

/** HA's dark mode, for the map's colour scheme `auto`. */
function darkMode(hass) {
    return !!(hass && hass.themes && hass.themes.darkMode);
}

function snapshotUnchanged(snapshot, hass) {
    if (!snapshot || !hass || !hass.states) return false;
    if (BuschUI.language(hass, { legacy: true }) !== snapshot.language) return false;
    if (snapshot.dark !== undefined && darkMode(hass) !== snapshot.dark) return false;
    return snapshot.ids.every((id, i) => hass.states[id] === snapshot.objects[i]);
}

// ---------------------------------------------------------------------------
// Map view (map-view): the live map and the map contract for later modules
// ---------------------------------------------------------------------------

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Vacuum attributes the map shows (ALL-13 display); a change of any redraws the map's frame. */
const MAP_VACUUM_KEYS = ['maps', 'map_count', 'selected_map', 'has_saved_map', 'has_temporary_map', 'mapping', 'started', 'customized_cleaning', 'skipped_segments', 'cleaning_sequence'];

/** MAP-02: zoom limits, button/key step, wheel speed, tap and double tap tolerances. */
const MAP_ZOOM = { min: 1, max: 8, step: 2, wheel: 0.0015 };
const TAP = { slop: 6, doubleMs: 300, doubleSlop: 24, longMs: 500, hitPx: 22 };
const MAP_MODES = ['view', 'pick-room', 'pick-point', 'draw-rect', 'drag'];
const LOUPE = { size: 120, magnify: 2 };

/** Map colours per scheme (MAP-05): canvas colours of data mode; layers read the --bvc-map-* set from them. */
const MAP_SCHEMES = {
    light: { floor: '#dde3ea', wall: '#5c6670', room: ['#a9c7ec', '#b5dcb0', '#f3d79e', '#e2b8d6'], carpet: 'rgba(0, 0, 0, 0.16)', path: '#5c6670' },
    dark: { floor: '#2a3038', wall: '#9aa4ae', room: ['#2d5680', '#3a6537', '#75602f', '#663b5e'], carpet: 'rgba(255, 255, 255, 0.14)', path: '#b0bac4' },
    grey: { floor: '#e3e3e3', wall: '#5e5e5e', room: ['#c2c2c2', '#d0d0d0', '#b0b0b0', '#dadada'], carpet: 'rgba(0, 0, 0, 0.14)', path: '#5e5e5e' }
};

/** A CSS colour as [r, g, b, a] (0–255); hex and rgb()/rgba() here, other forms through a 1-px canvas. */
function parseColor(value, fallback = [0, 0, 0, 0]) {
    const text = String(value || '').trim();
    let m = /^#([0-9a-f]{3,8})$/i.exec(text);
    if (m) {
        let h = m[1];
        if (h.length <= 4) h = h.split('').map((c) => c + c).join('');
        const n = h.match(/../g).map((x) => parseInt(x, 16));
        return [n[0], n[1], n[2], n.length > 3 ? n[3] : 255];
    }
    m = /^rgba?\(([^)]+)\)$/i.exec(text);
    if (m) {
        const n = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
        return [n[0], n[1], n[2], n[3] === undefined ? 255 : Math.round(n[3] * 255)].map((v) => Math.min(255, Math.max(0, v || 0)));
    }
    try {
        const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = text;
        ctx.fillRect(0, 0, 1, 1);
        return Array.from(ctx.getImageData(0, 0, 1, 1).data);
    } catch (e) {
        return fallback;
    }
}

/**
 * Data mode picture (pure, MAP-05): one RGBA pixel per grid cell, y flipped,
 * cropped and turned like gridAffine. Rooms by their color_index, walls,
 * floor, carpet blended on top; `floorPlan` paints every room in one tone
 * with contours where two rooms meet.
 */
function paintMapPixels(grid, colors, { rooms = {}, floorPlan = false } = {}) {
    const crop = Array.isArray(grid.crop) ? grid.crop.map((v) => Number(v) || 0) : [0, 0, 0, 0];
    const W = grid.width, H = grid.height;
    const w0 = W - crop[0] - crop[2], h0 = H - crop[1] - crop[3];
    const turns = (((grid.rotation % 360) + 360) % 360) / 90;
    const width = turns % 2 ? h0 : w0, height = turns % 2 ? w0 : h0;
    const data = new Uint8ClampedArray(width * height * 4);
    const roomColor = (id) => {
        if (floorPlan) return colors.room;
        const index = rooms[id] && Number.isFinite(Number(rooms[id].color_index)) ? Number(rooms[id].color_index) : id;
        return colors.rooms[((index % colors.rooms.length) + colors.rooms.length) % colors.rooms.length];
    };
    const roomAtCell = (gx, gy) => (gx < 0 || gy < 0 || gx >= W || gy >= H ? null : roomOfCell(grid.cells[gy * W + gx]));
    for (let gy = 0; gy < H; gy++) {
        for (let gx = 0; gx < W; gx++) {
            const value = grid.cells[gy * W + gx];
            if (!value) continue;
            let x = gx - crop[0], y = H - 1 - gy - crop[1];
            if (x < 0 || y < 0 || x >= w0 || y >= h0) continue;
            for (let t = 0, w = w0; t < turns; t++) {
                [x, y] = [y, w - 1 - x];
                w = w === w0 ? h0 : w0;
            }
            const room = roomOfCell(value);
            let c = room !== null ? roomColor(room) : value >= 251 && value !== 253 && value !== 254 ? colors.wall : colors.floor;
            if (room !== null && floorPlan && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
                const other = roomAtCell(gx + dx, gy + dy);
                return other !== null && other !== room;
            })) c = colors.wall;
            const i = (y * width + x) * 4;
            data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = c[3];
            if (grid.carpet && grid.carpet[gy * W + gx] && colors.carpet && !floorPlan) {
                const a = colors.carpet[3] / 255;
                for (let k = 0; k < 3; k++) data[i + k] = Math.round(data[i + k] * (1 - a) + colors.carpet[k] * a);
            }
        }
    }
    return { width, height, data };
}

/** icon_set material: the mdi icon per symbol. */
const MATERIAL_ICONS = {
    robot: 'mdi:robot-vacuum', charger: 'mdi:ev-station', router: 'mdi:router-wireless', obstacle: 'mdi:alert',
    stain: 'mdi:water-alert', pet: 'mdi:paw', blocked: 'mdi:lock-outline', point: 'mdi:map-marker', station: 'mdi:home-alert'
};

/** Built-in layers: hidden_objects name, z order, how it draws. Modules add theirs with addLayer. */
const MAP_LAYERS = [
    ['path', 10, 'path'], ['carpets', 20, 'area'], ['detected_carpets', 21, 'area'], ['deleted_carpets', 22, 'area'],
    ['furnitures', 25, 'furniture'], ['no_go_areas', 30, 'area'], ['no_mopping_areas', 31, 'area'], ['ramps', 32, 'area'],
    ['curtains', 33, 'line'], ['virtual_walls', 40, 'line'], ['passable_thresholds', 41, 'line'], ['impassable_thresholds', 42, 'line'],
    ['rooms', 50, 'rooms'], ['cleaning_settings', 51, 'settings'], ['blocked_rooms', 52, 'blocked'],
    ['predefined_points', 60, 'points'], ['obstacles', 70, 'obstacles'], ['stains', 71, 'obstacles'], ['pets', 72, 'obstacles'],
    ['router', 80, 'point'], ['charger', 85, 'point'], ['station_status', 86, 'station'], ['robot', 90, 'robot']
];

/** Obstacle type codes (types.py ObstacleType) by layer; the rest are obstacles. Codes come with the map data. */
const OBSTACLE_KINDS = {
    stains: [139, 169, 202, 206, 214, 215, 216],
    pets: [135, 158, 209, 210],
    blocked_rooms: [200]
};

/**
 * Busch symbols (icon_set busch), drawn around 0,0 in screen px; each has its
 * own shape so no state speaks through colour alone (R17).
 */
const MAP_SYMBOLS = {
    robot: [['circle', { r: 13, class: 'ring' }], ['circle', { r: 10, class: 'body' }], ['path', { d: 'M4 -5 L10 0 L4 5 Z', class: 'mark' }]],
    charger: [['rect', { x: -10, y: -10, width: 20, height: 20, rx: 5, class: 'body' }], ['path', { d: 'M-5 1 L0 -4 L5 1 M-3.5 0 V5 H3.5 V0', class: 'mark' }]],
    router: [['circle', { r: 9, class: 'body' }], ['path', { d: 'M-5 -1 A7 7 0 0 1 5 -1 M-2.5 1.5 A3.5 3.5 0 0 1 2.5 1.5', class: 'mark' }], ['circle', { cy: 4, r: 1.5, class: 'dot' }]],
    obstacle: [['path', { d: 'M0 -10 L10 8 H-10 Z', class: 'body' }], ['path', { d: 'M0 -3 V3 M0 5 V5.5', class: 'mark' }]],
    stain: [['path', { d: 'M0 -10 C6 -2 8 2 8 4 A8 8 0 0 1 -8 4 C-8 2 -6 -2 0 -10 Z', class: 'body' }]],
    pet: [['circle', { cy: 3, r: 6, class: 'body' }], ['circle', { cx: -6, cy: -5, r: 3, class: 'body' }], ['circle', { cx: 0, cy: -8, r: 3, class: 'body' }], ['circle', { cx: 6, cy: -5, r: 3, class: 'body' }]],
    blocked: [['rect', { x: -7, y: -2, width: 14, height: 11, rx: 2, class: 'body' }], ['path', { d: 'M-4 -2 V-5 A4 4 0 0 1 4 -5 V-2', class: 'mark' }]],
    point: [['circle', { r: 8, class: 'body' }], ['circle', { r: 3, class: 'dot' }]],
    station: [['path', { d: 'M0 -9 L9 7 H-9 Z', class: 'body' }], ['path', { d: 'M0 -3 V2 M0 4 V4.5', class: 'mark' }]]
};

/** Corners of an area item (x0…y3, or a rectangle x0/y0/x1/y1) in robot mm. */
function areaCorners(item) {
    if (Array.isArray(item)) return [0, 2, 4, 6].map((i) => ({ x: item[i], y: item[i + 1] }));
    if (item.x2 !== undefined) return [0, 1, 2, 3].map((i) => ({ x: item['x' + i], y: item['y' + i] }));
    return [{ x: item.x0, y: item.y0 }, { x: item.x1, y: item.y0 }, { x: item.x1, y: item.y1 }, { x: item.x0, y: item.y1 }];
}

/** Obstacles of the current map as [id, item, layer]; the map data adds the type code. */
function obstacleList(view, ctx) {
    const codes = new Map(((ctx.data && ctx.data.raw && ctx.data.raw.obstacles) || []).map((o) => [String(o[0]), Number(o[3])]));
    const attr = ctx.objects.obstacles;
    return Object.entries(attr && typeof attr === 'object' ? attr : {}).map(([id, item]) => {
        const code = codes.get(id);
        const layer = Object.keys(OBSTACLE_KINDS).find((k) => OBSTACLE_KINDS[k].includes(code)) || 'obstacles';
        return [id, item, layer];
    });
}

/** Corners of a furniture item [x, y, width, height, type, edit_type, angle, …] in robot mm. */
function furnitureCorners(f) {
    const [x, y, w, h, , , angle] = f.map(Number);
    const rad = (angle || 0) * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
    return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([dx, dy]) => ({ x: x + dx * cos - dy * sin, y: y + dx * sin + dy * cos }));
}

const toPoints = (view, corners) => corners.map((c) => view.toImage(c)).map((p) => p.x + ',' + p.y).join(' ');

/** How each kind of built-in layer reads its source and draws. */
const MAP_DRAW = {
    area: {
        source: (view, name, ctx) => (ctx.data && ctx.data.raw && name === 'furnitures' ? ctx.data.raw[name] : ctx.objects[name]) || [],
        render: (view, name, group, ctx) => (MAP_DRAW.area.source(view, name, ctx)).forEach((item, i) => {
            group.appendChild(view.svgNode('polygon', { 'data-object': i, points: toPoints(view, areaCorners(item)) }));
        })
    },
    line: {
        source: (view, name, ctx) => ctx.objects[name] || [],
        render: (view, name, group, ctx) => (ctx.objects[name] || []).forEach((item, i) => {
            if (item.x2 !== undefined) return group.appendChild(view.svgNode('polygon', { 'data-object': i, points: toPoints(view, areaCorners(item)) }));
            const a = view.toImage({ x: item.x0, y: item.y0 }), b = view.toImage({ x: item.x1, y: item.y1 });
            group.appendChild(view.svgNode('line', { 'data-object': i, x1: a.x, y1: a.y, x2: b.x, y2: b.y }));
        })
    },
    furniture: {
        source: (view, name, ctx) => (ctx.data && ctx.data.raw && ctx.data.raw.furnitures) || [],
        // [x, y, width, height, type, edit_type, angle, …] (map.py get_data): centre, size and turn in robot mm.
        render: (view, name, group, ctx) => MAP_DRAW.furniture.source(view, name, ctx).forEach((f, i) => {
            group.appendChild(view.svgNode('polygon', { 'data-object': i, points: toPoints(view, furnitureCorners(f)) }));
        })
    },
    path: {
        source: (view, name, ctx) => (ctx.data && ctx.data.raw && ctx.data.raw.path) || [],
        // [type, x, y, x, y, …] per stroke; type 1 sweep, 2 mop, 3 sweep and mop (map.py path_types).
        render: (view, name, group, ctx) => MAP_DRAW.path.source(view, name, ctx).forEach((stroke, i) => {
            const pts = [];
            for (let j = 1; j + 1 < stroke.length; j += 2) {
                const p = view.toImage({ x: stroke[j], y: stroke[j + 1] });
                pts.push(p.x + ',' + p.y);
            }
            group.appendChild(view.svgNode('polyline', { 'data-object': i, 'data-kind': stroke[0], points: pts.join(' ') }));
        })
    },
    rooms: {
        source: (view, name, ctx) => [ctx.rooms, view.model.attr('cleaning_sequence'), view._highlight],
        render: (view, name, group, ctx) => {
            const size = view.config(ctx.index).font_size;
            for (const [id, room] of Object.entries(ctx.rooms)) {
                if (!room || room.x === undefined || room.visibility === 'Hidden') continue;
                const g = view._symbol(room, 'label', id);
                if (String(view._highlight) === String(id)) g.setAttribute('data-highlight', '');
                g.appendChild(view.svgNode('text', { 'data-role': 'name', 'font-size': size, 'text-anchor': 'middle', y: size * 0.35 })).textContent = room.custom_name || room.name || '';
                if (Number(room.order) > 0) {
                    const badge = view.svgNode('g', { class: 'badge', transform: 'translate(0 ' + (-size * 1.4) + ')' });
                    badge.appendChild(view.svgNode('circle', { r: size * 0.75 }));
                    badge.appendChild(view.svgNode('text', { 'data-role': 'order', 'font-size': size * 0.9, 'text-anchor': 'middle', y: size * 0.32 })).textContent = String(room.order);
                    g.appendChild(badge);
                }
                group.appendChild(g);
            }
        }
    },
    settings: {
        // Customized Cleaning (SET-04 shows them): per room suction level, water, passes.
        source: (view, name, ctx) => view.model.attr('customized_cleaning') ? Object.values(ctx.rooms).map((r) => [r.suction_level, r.water_volume, r.cleaning_times]) : null,
        render: (view, name, group, ctx) => {
            if (!view.model.attr('customized_cleaning')) return;
            const size = view.config(ctx.index).font_size;
            for (const [id, room] of Object.entries(ctx.rooms)) {
                if (!room || room.x === undefined) continue;
                const g = view._symbol(room, 'settings', id);
                const text = view.svgNode('text', { 'data-role': 'settings', 'font-size': size * 0.85, 'text-anchor': 'middle', y: size * 1.6 });
                text.textContent = [room.suction_level, room.water_volume].filter((v) => v !== undefined).map((v) => Number(v) + 1).join(' · ') + ' · ×' + (room.cleaning_times || 1);
                g.appendChild(text);
                group.appendChild(g);
            }
        }
    },
    blocked: {
        hit: (view, name, point, ctx) => MAP_DRAW.obstacles.hit(view, name, point, ctx),
        // Blocked rooms of the last run (obstacle type 200, with reason) and skipped rooms at their centre.
        source: (view, name, ctx) => [view.model.attr('skipped_segments'), obstacleList(view, ctx).filter((o) => o[2] === name), ctx.rooms],
        render: (view, name, group, ctx) => {
            for (const [id, item, layer] of obstacleList(view, ctx)) if (layer === name) group.appendChild(view._symbol(item, 'blocked', id));
            for (const id of view.model.attr('skipped_segments') || []) {
                const room = ctx.rooms[id];
                if (room && room.x !== undefined) group.appendChild(view._symbol(room, 'blocked', 'room-' + id));
            }
        }
    },
    points: {
        source: (view, name, ctx) => (ctx.data && ctx.data.raw && ctx.data.raw.predefined_points) || [],
        render: (view, name, group, ctx) => MAP_DRAW.points.source(view, name, ctx).forEach((p, i) => {
            group.appendChild(view._symbol({ x: p[0], y: p[1] }, 'point', i));
        })
    },
    obstacles: {
        // The nearest obstacle symbol within a finger's reach on screen.
        hit: (view, name, point, ctx) => {
            let best = null, distance = TAP.hitPx * view.config(ctx.index).object_scale;
            for (const [id, item] of obstacleList(view, ctx).filter((o) => o[2] === name)) {
                const d = view._screenDistance(item, point);
                if (d <= distance) { distance = d; best = { id, object: item }; }
            }
            return best;
        },
        source: (view, name, ctx) => obstacleList(view, ctx).filter((o) => o[2] === name),
        render: (view, name, group, ctx) => {
            const kind = { stains: 'stain', pets: 'pet' }[name] || 'obstacle';
            for (const [id, item] of obstacleList(view, ctx).filter((o) => o[2] === name)) {
                const g = view._symbol(item, kind, id);
                if (g) {
                    g.setAttribute('data-ignored', String(/ignored/i.test(String(item.ignore_status || '')) && !/not/i.test(String(item.ignore_status))));
                    group.appendChild(g);
                }
            }
        }
    },
    point: {
        source: (view, name, ctx) => ctx.objects[name + '_position'] || null,
        render: (view, name, group, ctx) => {
            const p = ctx.objects[name + '_position'];
            if (p) group.appendChild(view._symbol(p, name, name));
        }
    },
    station: {
        // The station's state next to it (DOCK-06 wording in core); text stays in the controls.
        source: (view, name, ctx) => [dockStatus(view.model).level, ctx.objects.charger_position || null],
        render: (view, name, group, ctx) => {
            const p = ctx.objects.charger_position;
            const level = dockStatus(view.model).level;
            if (!p || level === 'ok') return;
            const g = view._symbol(p, 'station', 'station');
            g.setAttribute('data-level', level);
            g.style.transform += ' translate(14px, -14px)';
            group.appendChild(g);
        }
    },
    robot: {
        // Position is not part of the source: moving only changes the transform (_placeRobot).
        source: (view, name, ctx) => [view.model.state && view.model.state.state, !!ctx.objects.vacuum_position],
        render: (view, name, group, ctx) => {
            const pos = ctx.objects.vacuum_position;
            if (!pos) return;
            const g = view._symbol(pos, 'robot', 'robot', { upright: false });
            g.setAttribute('data-state', (view.model.state && view.model.state.state) || 'unknown');
            group.appendChild(g);
        }
    }
};

/**
 * One per card (spec map-view, "Kartenvertrag"). Lives in the card's shadow
 * root and is never rebuilt on foreign updates: `update()` returns at once
 * unless the active map camera or a map attribute of the vacuum changed. The
 * image is fetched only for a new `entity_picture` and swapped after decode().
 */
class MapView {
    constructor(card) {
        this.card = card;
        this.hass = null;
        this.model = null;
        this.stats = { images: 0, data: 0, renders: 0, paints: 0 }; // for tests and the performance check
        this._cam = null;
        this._key = null;
        this._imageUrl = null;
        this._image = null;
        this._imageState = 'loading';
        this._matrix = null; // robot mm → image px
        this._size = { width: 0, height: 0 };
        // R21: zoom and pan are never remembered; every map starts fitted.
        this._zoom = 1;
        this._panX = 0;
        this._panY = 0;
        this._display = {}; // map_config rotation/scale/crop of the shown map
        this._pointers = new Map();
        this._gesture = null;
        this._lastTap = null;
        this._mode = 'view';
        this._layers = new Map(); // id → { z, render, hit, group, renders, sig, builtIn }
        this._data = null; // decoded map data (data mode)
        this._pictures = {}; // map_config background_image / overlay_image elements
        this._obstacleActions = new Map(); // id → { label, icon, run(obstacle) } of other modules
        this._ignorePending = null; // { id, wanted, timer }: one ignore call at a time (R11)
        this._build();
        this._bindGestures();
        for (const [name, z, kind] of MAP_LAYERS) this._addBuiltIn(name, z, kind);
    }

    _build() {
        this.el = document.createElement('div');
        this.el.className = 'map-view';
        this.region = document.createElement('div');
        this.region.className = 'map';
        this.region.setAttribute('role', 'group');
        this.region.tabIndex = 0;
        this.stage = document.createElement('div');
        this.stage.className = 'map-stage';
        this.pan = document.createElement('div');
        this.pan.className = 'map-pan';
        this.svg = document.createElementNS(SVG_NS, 'svg');
        this.svg.setAttribute('class', 'map-layers');
        this.svg.setAttribute('aria-hidden', 'true');
        this.pan.appendChild(this.svg);
        this.stage.appendChild(this.pan);
        this.notes = document.createElement('div');
        this.notes.className = 'map-notes';
        this.loupe = document.createElement('div');
        this.loupe.className = 'map-loupe';
        this.loupe.hidden = true;
        this.loupe.setAttribute('aria-hidden', 'true');
        this.loupeContent = document.createElement('div');
        this.loupeContent.className = 'map-loupe-content';
        this.loupe.appendChild(this.loupeContent);
        this.tools = document.createElement('div');
        this.tools.className = 'map-tools';
        this.lockReason = document.createElement('span');
        this.lockReason.id = 'map-lock-reason';
        // Hidden, yet a valid aria-describedby target (the description survives display: none).
        this.lockReason.hidden = true;
        this.tools.appendChild(this.lockReason);
        this._tool = {};
        for (const [name, icon, key, act] of [
            ['zoom-in', 'mdi:plus', 'zoomIn', () => this._zoomAt(this._zoom * MAP_ZOOM.step)],
            ['zoom-out', 'mdi:minus', 'zoomOut', () => this._zoomAt(this._zoom / MAP_ZOOM.step)],
            ['fit', 'mdi:fit-to-screen-outline', 'zoomFit', () => this._setView(1, 0, 0, true)],
            ['info', 'mdi:information-outline', 'karteninfo', () => this.card._openDialog(this._infoView())]
        ]) {
            const button = BuschUI.action({ label: translate(null, key), icon, variant: 'secondary', onClick: act });
            button.setAttribute('data-action', 'map-' + name);
            button.classList.add('map-tool');
            this._tool[name] = { button, icon, key, act };
            this.tools.appendChild(button);
        }
        this.bubble = document.createElement('div');
        this.bubble.className = 'map-bubble';
        this.bubble.hidden = true;
        this.bubble.setAttribute('role', 'dialog');
        this.region.append(this.stage, this.tools, this.loupe, this.bubble);
        this.el.append(this.region, this.notes);
    }

    _locked() {
        return this.card.getAttribute('data-locked') === 'true';
    }

    _bindGestures() {
        const stage = this.stage;
        stage.addEventListener('pointerdown', (e) => this._down(e));
        stage.addEventListener('pointermove', (e) => this._move(e));
        stage.addEventListener('pointerup', (e) => this._up(e, false));
        stage.addEventListener('pointercancel', (e) => this._up(e, true));
        stage.addEventListener('wheel', (e) => this._wheel(e), { passive: false });
        this.region.addEventListener('keydown', (e) => this._onKey(e));
        if (typeof ResizeObserver === 'function') new ResizeObserver(() => this._layout()).observe(stage);
    }

    _stageRect() {
        return this.stage.getBoundingClientRect();
    }

    _down(e) {
        if (this._locked() || !this._view) return;
        try { this.stage.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
        this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const base = { zoom: this._zoom, panX: this._panX, panY: this._panY };
        clearTimeout(this._longTimer);
        if (this._pointers.size === 1) {
            const g = Object.assign({ kind: 'press', start: { x: e.clientX, y: e.clientY } }, base);
            this._gesture = g;
            this._longTimer = setTimeout(() => {
                if (this._gesture !== g || g.kind !== 'press') return;
                g.kind = 'long';
                const robot = this.toRobot(this.fromScreen(g.start));
                if (robot) this._emit('map-long-press', { client: g.start, robot, hit: this.hitTest(g.start), mode: this._mode });
            }, TAP.longMs);
        } else if (this._pointers.size === 2) {
            const [a, b] = Array.from(this._pointers.values());
            this._gesture = Object.assign({ kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }, base);
        }
        this.el.setAttribute('data-gesture', '');
    }

    _move(e) {
        const point = this._pointers.get(e.pointerId);
        const g = this._gesture;
        if (!point || !g) return;
        point.x = e.clientX;
        point.y = e.clientY;
        if (g.kind === 'pinch' && this._pointers.size >= 2) {
            const [a, b] = Array.from(this._pointers.values());
            const zoom = g.zoom * Math.hypot(a.x - b.x, a.y - b.y) / g.dist;
            const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            const view = this._zoomed(g, zoom, g.mid);
            this._setView(view.zoom, view.panX + mid.x - g.mid.x, view.panY + mid.y - g.mid.y);
            return;
        }
        const dx = e.clientX - g.start.x, dy = e.clientY - g.start.y;
        if (g.kind === 'long') return;
        if (g.kind === 'press' && Math.hypot(dx, dy) < TAP.slop) return;
        clearTimeout(this._longTimer);
        const client = { x: e.clientX, y: e.clientY };
        // draw-rect and drag: one finger draws for the module, two fingers still zoom.
        if (g.kind === 'drag' || (g.kind === 'press' && ['draw-rect', 'drag'].includes(this._mode))) {
            if (g.kind === 'press') {
                g.kind = 'drag';
                g.robot = this.toRobot(this.fromScreen(g.start));
                this._emit('map-drag', { phase: 'start', mode: this._mode, start: g.robot, robot: g.robot, client: g.start });
            }
            this.showLoupe(client);
            this._emit('map-drag', { phase: 'move', mode: this._mode, start: g.robot, robot: this.toRobot(this.fromScreen(client)), client });
            return;
        }
        g.kind = 'pan';
        this._setView(g.zoom, g.panX + dx, g.panY + dy);
    }

    _up(e, cancelled) {
        const g = this._gesture;
        if (!this._pointers.delete(e.pointerId)) return;
        if (this._pointers.size === 1) {
            // A pinch ends with one finger left: it pans on from here.
            const [rest] = Array.from(this._pointers.values());
            this._gesture = { kind: 'pan', start: { x: rest.x, y: rest.y }, zoom: this._zoom, panX: this._panX, panY: this._panY };
            return;
        }
        if (this._pointers.size) return;
        clearTimeout(this._longTimer);
        this._gesture = null;
        this.el.removeAttribute('data-gesture');
        if (g && g.kind === 'drag') {
            this.hideLoupe();
            const client = { x: e.clientX, y: e.clientY };
            this._emit('map-drag', { phase: cancelled ? 'cancel' : 'end', mode: this._mode, start: g.robot, robot: this.toRobot(this.fromScreen(client)), client });
        }
        if (g && g.kind === 'press' && !cancelled) this._tap({ x: e.clientX, y: e.clientY });
    }

    _tap(client) {
        const now = Date.now();
        const last = this._lastTap;
        if (last && now - last.t < TAP.doubleMs && Math.hypot(client.x - last.x, client.y - last.y) < TAP.doubleSlop) {
            this._lastTap = null;
            if (this._mode === 'view') {
                this._zoomAt(this._zoom * MAP_ZOOM.step, client);
                return;
            }
        }
        this._lastTap = { t: now, x: client.x, y: client.y };
        this._emitTap(client);
    }

    /** A tap becomes contract events: always map-tap, then object or room by mode. */
    _emitTap(client) {
        if (this._locked()) return;
        const hit = this.hitTest(client);
        if (!hit) return;
        this._closeBubble();
        if (this._picking) {
            this._endPick();
            this.card._openDialog(this._infoView(hit));
        }
        this._emit('map-tap', { client, robot: hit.robot, hit, passable: this.passable(hit.robot), mode: this._mode });
        if (hit.kind === 'object' && this._mode === 'view') {
            this._emit('map-object-tap', { id: hit.id, layer: hit.layer, object: hit.object, robot: hit.robot, client });
            if (['obstacles', 'stains', 'pets', 'blocked_rooms'].includes(hit.layer)) this._openBubble(hit.id, hit.object);
        }
        else if (hit.kind === 'room' && ['view', 'pick-room'].includes(this._mode)) this._roomTap(hit.id, 'map');
    }

    /** Area and chip lead here alike (R08): one event, the chips' onToggle, the highlight. */
    _roomTap(id, source, keys) {
        this._emit('map-room-tap', Object.assign({ room: id, source, mode: this._mode }, keys));
        if (this._chipToggle) this._chipToggle(id);
        if (this._mode === 'view' && source === 'chip') this._showRoom(id);
    }

    /** View mode: a room chip brings its room into view (unlocked) and marks it. */
    _showRoom(id) {
        this._highlight = this._highlight === id ? null : id;
        const room = this.current().rooms[id];
        if (this._highlight !== null && room && room.x0 !== undefined && this._view && !this._locked()) {
            const corners = areaCorners(room).map((c) => this.toImage(c)).filter(Boolean);
            const rect = this._stageRect();
            const base = viewMatrix(Object.assign({ width: this._size.width, height: this._size.height, stageWidth: rect.width, stageHeight: rect.height }, this._display));
            const pts = corners.map((c) => applyAffine(base, c));
            const w = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
            const h = Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y));
            const zoom = Math.min(MAP_ZOOM.max, Math.max(MAP_ZOOM.min, 0.8 * Math.min(rect.width / (w || 1), rect.height / (h || 1))));
            const centre = applyAffine(viewMatrix(Object.assign({ width: this._size.width, height: this._size.height, stageWidth: rect.width, stageHeight: rect.height, zoom }, this._display)), this.toImage(room));
            this._setView(zoom, rect.width / 2 - centre.x, rect.height / 2 - centre.y, true);
        }
        this._renderLayers();
        this._renderChips();
    }

    // ── Hit test and modes (MAP-08, contract) ─────────────────────────────

    setMode(mode, options) {
        if (!MAP_MODES.includes(mode)) throw new Error('Unknown map mode: ' + mode);
        this._mode = mode;
        this._modeOptions = options || {};
        this.hideLoupe();
        this.el.setAttribute('data-mode', mode);
        this._renderChips();
    }

    /** Room under a robot point: exact from the map data, else rectangle and nearest centre. */
    roomAt(p) {
        if (!p) return null;
        const rooms = this.current().rooms;
        const id = this._data ? roomAtGrid(this._data.grid, p) : roomAtRects(rooms, p);
        return id !== null && rooms[id] ? Number(id) : null;
    }

    /** Whether the robot can reach a point: data mode only, null when unknown (clean-tasks blocks only on false). */
    passable(p) {
        return this._data && p ? passableGrid(this._data.grid, p) : null;
    }

    hitTest(client) {
        const image = this.fromScreen(client);
        const robot = image && this.toRobot(image);
        if (!robot) return null;
        const ctx = this._ctx();
        const layers = Array.from(this._layers.entries()).filter(([, l]) => l.hit && !l.group.hidden).sort((x, y) => y[1].z - x[1].z);
        for (const [layer, l] of layers) {
            const found = l.hit(robot, ctx);
            if (found) return { kind: 'object', id: found.id !== undefined ? found.id : found, layer, object: found.object !== undefined ? found.object : found, robot, image };
        }
        const room = this.roomAt(robot);
        if (room !== null) return { kind: 'room', id: room, robot, image, object: null };
        return { kind: this.passable(robot) ? 'floor' : 'outside', id: null, robot, image, object: null };
    }

    /** Screen distance between two robot points, for symbol hits. */
    _screenDistance(a, b) {
        const p = this.toScreen(this.toImage(a)), q = this.toScreen(this.toImage(b));
        return p && q ? Math.hypot(p.x - q.x, p.y - q.y) : Infinity;
    }

    // ── Room chips (MAP-08 base solution, R15/R16/R22) ────────────────────

    /**
     * The one room chip list for all modules (R08): a toggle button per room
     * with name, icon and order badge; arrows move, Space/Enter acts. A chip
     * tap is the same event as a tap on the room's area.
     */
    roomChips({ rooms, selected = [], order = [], onToggle } = {}) {
        const hass = this.hass;
        const list = document.createElement('div');
        list.className = 'room-chips';
        list.setAttribute('role', 'group');
        list.setAttribute('aria-label', translate(hass, 'raeume'));
        const entries = Object.entries(rooms || {}).filter(([, r]) => r && r.visibility !== 'Hidden');
        const chosen = new Set(selected.map(String));
        const buttons = entries.map(([id, room], index) => {
            const name = room.custom_name || room.name || id;
            const position = order.map(String).indexOf(String(id)) + 1;
            const button = BuschUI.action({
                label: position ? translate(hass, 'raumPosition', { name, n: position }) : name,
                text: name,
                icon: room.icon || 'mdi:floor-plan',
                variant: 'secondary',
                onClick: (event) => {
                    if (onToggle) onToggle(Number(id));
                    // R02: Shift picks a range, Ctrl/Cmd toggles (a plain tap toggles too).
                    const keys = { shift: !!(event && event.shiftKey), toggle: !!(event && (event.ctrlKey || event.metaKey)) };
                    if (list === this.chips) this._roomTap(Number(id), 'chip', keys);
                    else this._emit('map-room-tap', Object.assign({ room: Number(id), source: 'chip', mode: this._mode }, keys));
                }
            });
            button.classList.add('room-chip');
            button.setAttribute('data-room', id);
            button.setAttribute('aria-pressed', String(chosen.has(String(id))));
            button.tabIndex = index === 0 ? 0 : -1;
            if (position) {
                const badge = document.createElement('span');
                badge.className = 'room-order';
                badge.setAttribute('aria-hidden', 'true');
                badge.textContent = String(position);
                button.appendChild(badge);
            }
            button.addEventListener('keydown', (event) => {
                const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: -Infinity, End: Infinity }[event.key];
                if (!step) return;
                event.preventDefault();
                const next = Number.isFinite(step) ? (index + step + buttons.length) % buttons.length : step < 0 ? 0 : buttons.length - 1;
                buttons.forEach((b, i) => { b.tabIndex = i === next ? 0 : -1; });
                buttons[next].focus();
            });
            return button;
        });
        list.append(...buttons);
        return list;
    }

    _renderChips() {
        if (!this.model) return;
        // pick-room: the module's selection, order and fallback rooms (setMode options), e.g. clean-tasks.
        const o = this._mode === 'pick-room' ? this._modeOptions : {};
        const rooms = this._showsMap() ? this.current().rooms : o.fallbackRooms ? o.fallbackRooms() : {};
        const picked = o.selected ? o.selected() : null;
        const ownOrder = o.order ? o.order() : null;
        const key = JSON.stringify([rooms, this._highlight, BuschUI.language(this.hass, { legacy: true }), this._mode, picked, ownOrder]);
        if (key === this._chipsKey) return;
        this._chipsKey = key;
        const root = this.card.shadowRoot;
        const active = root && root.activeElement;
        const focusedRoom = active && active.getAttribute ? active.getAttribute('data-room') : null;
        // The cleaning sequence as on the map's badges (R01).
        const order = Object.entries(rooms).filter(([, r]) => Number(r && r.order) > 0).sort((x, y) => x[1].order - y[1].order).map(([id]) => id);
        const highlight = this._highlight !== null && this._highlight !== undefined ? [this._highlight] : [];
        const chips = this.roomChips({ rooms, selected: picked || highlight, order: ownOrder || order });
        if (this.chips) this.chips.remove();
        this.el.insertBefore(chips, this.notes);
        this.chips = chips;
        // Zone, spot and go-to place points and areas: room chips would only be in the way there.
        chips.hidden = !chips.childNodes.length || !['view', 'pick-room'].includes(this._mode);
        const again = focusedRoom && chips.querySelector('[data-room="' + focusedRoom + '"]');
        if (again) {
            chips.querySelectorAll('.room-chip').forEach((b) => { b.tabIndex = b === again ? 0 : -1; });
            again.focus();
        }
    }

    _wheel(e) {
        if (this._locked() || !this._view) return;
        e.preventDefault();
        this._zoomAt(this._zoom * Math.exp(-e.deltaY * MAP_ZOOM.wheel), { x: e.clientX, y: e.clientY }, false);
    }

    _onKey(e) {
        if (e.key === 'Escape' && this._picking) {
            e.preventDefault();
            this._endPick();
            return;
        }
        if (e.key === 'Escape' && !this.bubble.hidden) {
            e.preventDefault();
            this._closeBubble();
            return;
        }
        if (this._locked() || !this._view) return;
        const rect = this._stageRect();
        const stepX = rect.width / 10, stepY = rect.height / 10;
        const act = {
            '+': () => this._zoomAt(this._zoom * MAP_ZOOM.step), '=': () => this._zoomAt(this._zoom * MAP_ZOOM.step),
            '-': () => this._zoomAt(this._zoom / MAP_ZOOM.step), '0': () => this._setView(1, 0, 0, true),
            ArrowLeft: () => this._setView(this._zoom, this._panX + stepX, this._panY, true),
            ArrowRight: () => this._setView(this._zoom, this._panX - stepX, this._panY, true),
            ArrowUp: () => this._setView(this._zoom, this._panX, this._panY + stepY, true),
            ArrowDown: () => this._setView(this._zoom, this._panX, this._panY - stepY, true)
        }[e.key];
        if (!act) return;
        e.preventDefault();
        act();
    }

    /** The view after zooming `from` to `zoom` with the image point under `client` kept in place. */
    _zoomed(from, zoom, client) {
        const z = Math.min(MAP_ZOOM.max, Math.max(MAP_ZOOM.min, zoom));
        const rect = this._stageRect();
        const sx = (client ? client.x - rect.left : rect.width / 2) - rect.width / 2;
        const sy = (client ? client.y - rect.top : rect.height / 2) - rect.height / 2;
        const f = z / from.zoom;
        return { zoom: z, panX: sx * (1 - f) + from.panX * f, panY: sy * (1 - f) + from.panY * f };
    }

    _zoomAt(zoom, client, animate = true) {
        const view = this._zoomed({ zoom: this._zoom, panX: this._panX, panY: this._panY }, zoom, client);
        this._setView(view.zoom, view.panX, view.panY, animate);
    }

    /** New zoom and pan within limits: 1×–8×, the map's centre never leaves the stage, 1× is centred. */
    _setView(zoom, panX, panY, animate = false) {
        this.el.toggleAttribute('data-animate', animate);
        this._zoom = Math.min(MAP_ZOOM.max, Math.max(MAP_ZOOM.min, zoom));
        const rect = this._stageRect();
        const fitted = this._fitted(rect);
        const limitX = fitted ? fitted.width * this._zoom / 2 : 0, limitY = fitted ? fitted.height * this._zoom / 2 : 0;
        this._panX = this._zoom === 1 ? 0 : Math.min(limitX, Math.max(-limitX, panX));
        this._panY = this._zoom === 1 ? 0 : Math.min(limitY, Math.max(-limitY, panY));
        this._layout();
    }

    /** Size of the fitted map at 1× in stage px. */
    _fitted(rect) {
        const { width, height } = this._size;
        if (!width || !height) return null;
        const m = viewMatrix(Object.assign({ width, height, stageWidth: rect.width, stageHeight: rect.height }, this._display));
        const k = Math.hypot(m.a, m.b);
        const turned = [90, 270].includes(Number(this._display.rotation) % 360);
        return { width: (turned ? height : width) * k, height: (turned ? width : height) * k };
    }

    /** Called by the card when the lock changes: gestures and buttons follow data-locked. */
    lockChanged() {
        this._renderTools();
    }

    _renderTools() {
        const many = Number(this.model && this.model.attr('map_count')) > 1 && this._maps().length > 1;
        if (many && !this._floorButton) {
            this._floorReason = document.createElement('span');
            this._floorReason.id = 'map-floor-reason';
            this._floorReason.hidden = true;
            this._floorButton = BuschUI.action({ label: translate(this.hass, 'stockwerkWaehlen'), icon: 'mdi:layers-triple-outline', variant: 'secondary', onClick: () => this.card._openDialog(this._floorsView()) });
            this._floorButton.setAttribute('data-action', 'map-floors');
            this._floorButton.setAttribute('aria-haspopup', 'dialog');
            this._floorButton.classList.add('map-tool');
            this.tools.insertBefore(this._floorReason, this.tools.firstChild);
            this.tools.insertBefore(this._floorButton, this._floorReason);
        } else if (!many && this._floorButton) {
            this._floorButton.remove();
            this._floorReason.remove();
            this._floorButton = null;
        }
        if (this._floorButton) {
            const busy = this._busy();
            this._floorReason.textContent = translate(this.hass, 'stockwerkGesperrt');
            BuschUI.action({ node: this._floorButton, label: translate(this.hass, 'stockwerkWaehlen'), icon: 'mdi:layers-triple-outline', variant: 'secondary', disabled: busy, onClick: () => this.card._openDialog(this._floorsView()) });
            if (busy) this._floorButton.setAttribute('aria-describedby', 'map-floor-reason');
            else this._floorButton.removeAttribute('aria-describedby');
        }
        const locked = this._locked();
        this.lockReason.textContent = translate(this.hass, 'zoomGesperrt');
        for (const [name, tool] of Object.entries(this._tool)) {
            if (name === 'info') {
                BuschUI.action({ node: tool.button, label: translate(this.hass, tool.key), icon: tool.icon, variant: 'secondary', onClick: tool.act });
                continue;
            }
            const limit = (name === 'zoom-in' && this._zoom >= MAP_ZOOM.max) || (name !== 'zoom-in' && this._zoom <= MAP_ZOOM.min);
            BuschUI.action({ node: tool.button, label: translate(this.hass, tool.key), icon: tool.icon, variant: 'secondary', disabled: locked || limit, onClick: tool.act });
            if (locked) tool.button.setAttribute('aria-describedby', 'map-lock-reason');
            else tool.button.removeAttribute('aria-describedby');
        }
        this.tools.hidden = !this._view;
    }

    toScreen(p) {
        if (!this._view || !p) return null;
        const rect = this._stageRect();
        const s = applyAffine(this._view, p);
        return { x: s.x + rect.left, y: s.y + rect.top };
    }

    fromScreen(p) {
        const inverse = this._view && invertAffine(this._view);
        if (!inverse || !p) return null;
        const rect = this._stageRect();
        return applyAffine(inverse, { x: p.x - rect.left, y: p.y - rect.top });
    }

    /** Magnified cut-out under a pointer, e.g. while another module drags on the map. */
    showLoupe(client) {
        const q = this.fromScreen(client);
        if (!q || !this._image) return;
        if (this._loupeSource !== this._image) {
            this._loupeSource = this._image;
            const copy = this._image.cloneNode ? this._image.cloneNode(true) : document.createElement('img');
            // A canvas clone is empty: draw the map into it.
            if (copy.tagName === 'CANVAS' && typeof copy.getContext === 'function') copy.getContext('2d').drawImage(this._image, 0, 0);
            this.loupeContent.replaceChildren(copy);
        }
        const rect = this._stageRect();
        // The view's turn and scale, magnified, with the point under the pointer in the loupe's centre.
        const v = this._view, s = LOUPE.magnify;
        const m = { a: v.a * s, b: v.b * s, c: v.c * s, d: v.d * s, e: 0, f: 0 };
        const centre = applyAffine(m, q);
        m.e = LOUPE.size / 2 - centre.x;
        m.f = LOUPE.size / 2 - centre.y;
        this.loupeContent.style.width = this._size.width + 'px';
        this.loupeContent.style.height = this._size.height + 'px';
        this.loupeContent.style.transform = 'matrix(' + [m.a, m.b, m.c, m.d, m.e, m.f].join(',') + ')';
        // Above and left of the finger, so the finger does not cover it.
        const x = Math.max(0, client.x - rect.left - LOUPE.size - 16), y = Math.max(0, client.y - rect.top - LOUPE.size - 16);
        this.loupe.style.transform = 'translate(' + x + 'px,' + y + 'px)';
        this.loupe.setAttribute('data-image-x', String(Math.round(q.x)));
        this.loupe.setAttribute('data-image-y', String(Math.round(q.y)));
        this.loupe.hidden = false;
    }

    hideLoupe() {
        this.loupe.hidden = true;
    }

    _attrs() {
        return (this._cam && this._cam.attributes) || {};
    }

    /** Called by the card on every own update; returns at once when nothing of the map changed. */
    update(hass, model) {
        this.hass = hass;
        this.model = model;
        const id = model.related.maps.map[0];
        const cam = (hass.states && hass.states[id]) || null;
        const key = JSON.stringify([BuschUI.language(hass, { legacy: true }), darkMode(hass), model.state && model.state.state, ...MAP_VACUUM_KEYS.map((k) => model.attr(k))]);
        if (cam === this._cam && key === this._key) return;
        const before = this._cam ? this._attrs().map_index : undefined;
        const pend = this._ignorePending;
        const seen = pend && cam && cam.attributes.obstacles && cam.attributes.obstacles[pend.id];
        if (seen && (/ignored/i.test(String(seen.ignore_status)) && !/not/i.test(String(seen.ignore_status))) === pend.wanted) {
            clearTimeout(pend.timer);
            this._ignorePending = null;
        }
        this._cam = cam;
        this._key = key;
        this._cameraId = id;
        this.stats.renders++;
        const a = this._attrs();
        this._matrix = this._data ? gridAffine(this._data.grid).matrix : affineFrom(a.calibration_points);
        const options = this.config(a.map_index);
        this._display = { rotation: options.rotation, scale: options.scale, crop: options.crop };
        if (before !== undefined && before !== a.map_index) {
            // Another floor: it starts fitted (R21), the module layers learn it from the event.
            this._zoom = 1;
            this._panX = 0;
            this._panY = 0;
            this._emit('map-changed', { index: a.map_index, mapId: a.map_id });
        }
        this.region.setAttribute('aria-label', translate(hass, 'karteAlt', { karte: this._mapName() }));
        this._applyScheme();
        if (this._showsMap()) {
            // Data mode paints its own map: the integration's picture only until the data is there.
            if (!this._data) this._loadImage(a.entity_picture);
            this._loadData(a);
            this._paint();
        }
        this._render();
        this._renderLayers();
        this._renderChips();
    }

    /**
     * Data mode (spec: Entscheidung Spike): the map data of the active camera,
     * only for a new frame_id; `&v=` because the answer is cached as immutable.
     * Without fetch, on failure or for an empty map the card stays in image mode.
     */
    _loadData(a) {
        const frame = a.frame_id;
        if (frame === undefined || frame === this._dataFrame || typeof fetch !== 'function' || !a.access_token) return;
        this._dataFrame = frame;
        this.stats.data++;
        const url = '/api/camera_map_data_proxy/' + this._cameraId + '?token=' + encodeURIComponent(a.access_token) + '&v=' + encodeURIComponent(frame);
        Promise.resolve().then(() => fetch(this._url(url))).then((res) => (res && res.ok ? res.json() : null)).then((raw) => {
            if (this._dataFrame !== frame) return;
            const grid = decodeMapData(raw);
            this._data = grid ? { raw, grid } : null;
            if (this._data) {
                this._matrix = gridAffine(grid).matrix;
                this._paint();
                this._render();
            }
            this._emit('map-frame', { frameId: frame, mode: this._data ? 'data' : 'image' });
            this._renderLayers();
        }).catch(() => {
            if (this._dataFrame === frame) this._data = null;
        });
    }

    _emit(type, detail) {
        this.el.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: false }));
    }

    /** Whether there is a map to show at all (R18: empty and failed states replace it). */
    _showsMap() {
        const cam = this._cam;
        if (!cam || UNUSABLE.includes(cam.state)) return false;
        const m = this.model;
        const nothing = m.attr('has_saved_map') === false && !m.attr('has_temporary_map') && !m.attr('mapping');
        return !(cam.attributes.is_empty === true || nothing);
    }

    _mapName() {
        const index = this._attrs().map_index;
        const maps = this.model ? this.model.attr('maps') : null;
        const entry = Array.isArray(maps) ? maps.find((m) => m && m.index === index) : null;
        return (entry && (entry.custom_name || entry.name)) || (this.model && this.model.attr('selected_map')) || translate(this.hass, 'karte');
    }

    _url(path) {
        return this.hass && typeof this.hass.hassUrl === 'function' ? this.hass.hassUrl(path) : path;
    }

    _loadImage(url, force) {
        if (!url || (url === this._imageUrl && !force)) return;
        this._imageUrl = url;
        this._imageState = 'loading';
        this.stats.images++;
        const img = document.createElement('img');
        img.className = 'map-base';
        img.setAttribute('decoding', 'async');
        img.setAttribute('src', this._url(url));
        // Swapped only once decoded: the old image stays until then, no flicker.
        Promise.resolve(typeof img.decode === 'function' ? img.decode() : undefined).then(() => {
            if (this._imageUrl !== url) return;
            img.setAttribute('alt', translate(this.hass, 'karteAlt', { karte: this._mapName() }));
            if (this._image) this._image.remove();
            this._image = img;
            this._size = { width: img.naturalWidth || 0, height: img.naturalHeight || 0 };
            this.pan.insertBefore(img, this._pictures.overlay || this.svg);
            this._imageState = 'ready';
            this._render();
            this._renderLayers();
        }, () => {
            if (this._imageUrl !== url) return;
            this._imageState = 'error';
            this._render();
        });
    }

    _render() {
        const hass = this.hass;
        const shows = this._showsMap();
        const notes = [];
        if (!this._cam || UNUSABLE.includes(this._cam.state)) notes.push(['unavailable', 'mdi:map-marker-off-outline', 'kameraWeg']);
        else if (!shows) notes.push(['empty', 'mdi:map-search-outline', 'karteLeer']);
        else {
            if (this._imageState === 'loading') notes.push(['loading', 'mdi:progress-clock', 'karteLaedt']);
            if (this._imageState === 'error') notes.push(['error', 'mdi:image-broken-variant', 'bildFehler']);
            if (this.model.attr('has_temporary_map')) notes.push(['temporary', 'mdi:map-clock-outline', 'temporaereKarte']);
            if (this.model.attr('mapping')) notes.push(['mapping', 'mdi:map-plus', 'kartierungLaeuft']);
            if (!this._matrix && this._imageState === 'ready') notes.push(['uncalibrated', 'mdi:crosshairs-question', 'ohneKalibrierung']);
            if (this._picking) notes.push(['pick', 'mdi:crosshairs-gps', 'koordinateHinweis']);
        }
        this.stage.hidden = !shows;
        this.el.toggleAttribute('data-mode-image', !this._data);
        this.stage.setAttribute('aria-busy', String(this._imageState === 'loading'));
        this.notes.replaceChildren(...notes.map(([kind, icon, key]) => this._note(kind, icon, translate(hass, key))));
        this._layout();
    }

    /** MAP-05/09: scheme colours (auto follows HA's dark mode) with override_colors, as --bvc-map-* on the view. */
    _applyScheme() {
        const opts = this.card._opts || {};
        const scheme = opts.color_scheme === 'auto' || !opts.color_scheme ? (darkMode(this.hass) ? 'dark' : 'light') : opts.color_scheme;
        const own = Object.assign({}, opts.override_colors || {});
        const dark = own.dark || {};
        delete own.dark;
        const override = Object.assign(own, scheme === 'dark' ? dark : {});
        const base = MAP_SCHEMES[scheme];
        const colors = {
            floor: override.floor || base.floor, wall: override.wall || base.wall, carpet: override.carpet || base.carpet, path: override.path || base.path,
            room: override.room ? [override.room, override.room, override.room, override.room] : base.room
        };
        const style = this.el.style;
        for (const key of ['floor', 'wall', 'carpet', 'path']) style.setProperty('--bvc-map-' + key, colors[key]);
        colors.room.forEach((value, i) => style.setProperty('--bvc-map-room-' + i, value));
        for (const key of ['no_go', 'no_mop', 'virtual_wall', 'robot', 'charger']) {
            const name = '--bvc-map-' + key.replace('_', '-');
            if (override[key]) style.setProperty(name, override[key]);
            else style.removeProperty(name);
        }
        this.el.setAttribute('data-scheme', scheme);
        this._colors = colors;
    }

    /** Data mode: the map from its pixel layers, only for a new frame, scheme or display (R20). */
    _paint() {
        if (!this._data) return;
        const opts = this.card._opts || {};
        const floorPlan = opts.map_display === 'floor_plan';
        const key = JSON.stringify([this._dataFrame, this._colors, floorPlan]);
        if (key === this._paintKey) return;
        this._paintKey = key;
        this.stats.paints++;
        const c = this._colors;
        const picture = paintMapPixels(this._data.grid, {
            floor: parseColor(c.floor), wall: parseColor(c.wall), carpet: parseColor(c.carpet),
            rooms: c.room.map((v) => parseColor(v)), room: parseColor(c.room[0])
        }, { rooms: this._attrs().rooms || {}, floorPlan });
        this._painted = { floorPlan, width: picture.width, height: picture.height };
        let canvas = this._image && this._image.tagName === 'CANVAS' ? this._image : null;
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.className = 'map-base';
            canvas.setAttribute('role', 'img');
            if (this._image) this._image.remove();
            this.pan.insertBefore(canvas, this._pictures.overlay || this.svg);
            this._image = canvas;
        }
        canvas.setAttribute('aria-label', translate(this.hass, 'karteAlt', { karte: this._mapName() }));
        canvas.width = picture.width;
        canvas.height = picture.height;
        const ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
        if (ctx && typeof ImageData === 'function') ctx.putImageData(new ImageData(picture.data, picture.width, picture.height), 0, 0);
        this._imageUrl = null;
        this._imageState = 'ready';
        this._size = { width: picture.width, height: picture.height };
    }

    _note(kind, icon, text) {
        const node = document.createElement('div');
        node.className = 'map-note';
        node.setAttribute('data-kind', kind);
        node.setAttribute('role', ['error', 'unavailable'].includes(kind) ? 'alert' : 'status');
        const symbol = BuschUI.ha.icon(icon);
        symbol.setAttribute('aria-hidden', 'true');
        const span = document.createElement('span');
        span.textContent = text;
        node.append(symbol, span);
        if (kind === 'pick') {
            const cancel = BuschUI.action({ label: translate(this.hass, 'abbrechen'), text: translate(this.hass, 'abbrechen'), variant: 'quiet', onClick: () => this._endPick() });
            cancel.setAttribute('data-action', 'pick-cancel');
            node.appendChild(cancel);
        }
        if (kind === 'error') {
            const retry = BuschUI.action({ label: translate(this.hass, 'erneutLaden'), text: translate(this.hass, 'erneutLaden'), icon: 'mdi:refresh', variant: 'quiet', onClick: () => this._loadImage(this._imageUrl, true) });
            retry.setAttribute('data-action', 'map-retry');
            node.appendChild(retry);
        }
        return node;
    }

    /** Places the map in the stage: fitted, then zoom and pan; one transform on one element (R20). */
    _layout() {
        const { width, height } = this._size;
        this.el.toggleAttribute('data-still', !!(this.card._opts && this.card._hidden('animations')));
        if (!width || !height) {
            this._view = null;
            this._renderTools();
            return;
        }
        const turned = [90, 270].includes(Number(this._display.rotation) % 360);
        this.stage.style.setProperty('--bvc-map-aspect', turned ? height + ' / ' + width : width + ' / ' + height);
        const rect = this._stageRect();
        this._view = viewMatrix(Object.assign({ width, height, stageWidth: rect.width, stageHeight: rect.height, zoom: this._zoom, panX: this._panX, panY: this._panY }, this._display));
        this._renderTools();
        this._placePictures();
        const m = this._view;
        this.pan.style.width = width + 'px';
        this.pan.style.height = height + 'px';
        this.pan.style.transform = 'matrix(' + [m.a, m.b, m.c, m.d, m.e, m.f].join(',') + ')';
        this.svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
        // Symbols keep their screen size: image px per screen px, times object_scale.
        const options = this.config(this._attrs().map_index);
        this.svg.style.setProperty('--bvc-map-symbol', String(options.object_scale / Math.hypot(m.a, m.b)));
        this.svg.style.setProperty('--bvc-map-turn', -(Number(this._display.rotation) || 0) + 'deg');
        this.svg.style.opacity = String(options.object_opacity);
    }

    /** MAP-06: the map's opacity and own pictures under/over it, placed by their robot-mm corners. */
    _placePictures() {
        const options = this.config(this._attrs().map_index);
        if (this._image) this._image.style.opacity = String(options.opacity);
        for (const [kind, key] of [['background', 'background_image'], ['overlay', 'overlay_image']]) {
            const picture = options[key];
            let node = this._pictures[kind];
            const a = picture && this.toImage({ x: picture.x0, y: picture.y1 }), b = picture && this.toImage({ x: picture.x1, y: picture.y0 });
            if (!a || !b) {
                if (node) node.remove();
                delete this._pictures[kind];
                continue;
            }
            if (!node) {
                node = document.createElement('img');
                node.className = 'map-' + kind;
                node.setAttribute('alt', '');
                this._pictures[kind] = node;
                if (kind === 'background') this.pan.insertBefore(node, this.pan.firstChild);
                else this.pan.insertBefore(node, this.svg);
            }
            if (node.getAttribute('src') !== picture.url) node.setAttribute('src', this._url(picture.url));
            node.style.left = Math.min(a.x, b.x) + 'px';
            node.style.top = Math.min(a.y, b.y) + 'px';
            node.style.width = Math.abs(b.x - a.x) + 'px';
            node.style.height = Math.abs(b.y - a.y) + 'px';
        }
    }

    // ── Map info (CORE-19) ────────────────────────────────────────────────

    _startPick() {
        this._picking = { previous: this._mode };
        this.setMode('pick-point');
        this._render();
        this.region.focus();
    }

    _endPick() {
        const previous = this._picking ? this._picking.previous : 'view';
        this._picking = null;
        this.setMode(previous);
        this._render();
    }

    /** Facts for own pictures and automations; with `picked` the coordinate and the object below it. */
    _infoView(picked) {
        return {
            title: translate(this.hass, 'karteninfo'),
            kind: 'menu',
            watch: () => [this._cameraId],
            render: (body, hass, dialog) => {
                const locale = hass.locale && hass.locale.language;
                const n = (v) => BuschUI.formatNumber(v, locale) || String(v);
                const pt = (p) => '(' + Math.round(p.x) + ', ' + Math.round(p.y) + ')';
                const a = this._attrs();
                const rows = [];
                if (picked) {
                    rows.push(['koordinate', 'x ' + Math.round(picked.robot.x) + ' mm, y ' + Math.round(picked.robot.y) + ' mm']);
                    const room = picked.kind === 'room' && this.current().rooms[picked.id];
                    rows.push(['darunter', room ? translate(hass, 'taskRoom') + ' ' + (room.custom_name || room.name)
                        : picked.kind === 'object' ? translate(hass, 'hindernis') + ' ' + picked.id
                        : translate(hass, picked.kind === 'floor' ? 'boden' : 'ausserhalb')]);
                }
                const grid = this._data && this._data.grid;
                rows.push(['rohgroesse', grid ? translate(hass, 'zellen', { w: grid.width, h: grid.height, g: grid.grid }) : this._size.width + ' × ' + this._size.height + ' px']);
                if (this._matrix) {
                    rows.push(['massstab', n(Math.round(1000 / Math.hypot(this._matrix.a, this._matrix.b)) / 1000) + ' mm/px']);
                    rows.push(['ursprung', '(0, 0) mm → ' + pt(this.toImage({ x: 0, y: 0 })) + ' px']);
                    rows.push(['kalibrierung', [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 0, y: 1000 }].map((p) => pt(p) + ' mm → ' + pt(this.toImage(p)) + ' px').join('; ')]);
                }
                rows.push(['rotationGeraet', (grid ? grid.rotation : Number(a.rotation) || 0) + '°']);
                rows.push(['rotationAnzeige', (Number(this._display.rotation) || 0) + '°']);
                rows.push(['modus', translate(hass, grid ? 'modusDaten' : 'modusBild')]);
                const facts = document.createElement('dl');
                facts.className = 'obstacle-facts';
                for (const [key, value] of rows) {
                    const dt = document.createElement('dt');
                    dt.textContent = translate(hass, key);
                    const dd = document.createElement('dd');
                    dd.textContent = value;
                    facts.append(dt, dd);
                }
                body.appendChild(facts);
                const actions = document.createElement('div');
                actions.className = 'actions';
                if (picked) {
                    const copy = BuschUI.action({ label: translate(hass, 'kopieren'), text: translate(hass, 'kopieren'), icon: 'mdi:content-copy', variant: 'secondary', onClick: () => {
                        const text = Math.round(picked.robot.x) + ', ' + Math.round(picked.robot.y);
                        try { Promise.resolve(navigator.clipboard.writeText(text)).catch(() => {}); } catch (e) { /* no clipboard: the value stays readable above */ }
                    } });
                    copy.setAttribute('data-action', 'info-copy');
                    actions.appendChild(copy);
                }
                const locked = this._locked();
                const pick = BuschUI.action({ label: translate(hass, 'koordinateWaehlen'), text: translate(hass, 'koordinateWaehlen'), icon: 'mdi:crosshairs-gps', variant: 'primary', disabled: locked || !this._matrix, onClick: () => {
                    dialog.close();
                    this._startPick();
                } });
                pick.setAttribute('data-action', 'info-pick');
                actions.appendChild(pick);
                if (locked) {
                    const note = document.createElement('div');
                    note.className = 'obstacle-note';
                    note.textContent = translate(hass, 'waehlenGesperrt');
                    body.appendChild(note);
                }
                body.appendChild(actions);
            }
        };
    }

    // ── Obstacles (MAP-04) ────────────────────────────────────────────────

    /** Contract: an action of another module in the obstacle dialog (clean-tasks: "Spot hier"). */
    addObstacleAction(id, { label, icon, run }) {
        this._obstacleActions.set(id, { label, icon, run });
    }

    removeObstacleAction(id) {
        this._obstacleActions.delete(id);
    }

    /** The transient bubble at the symbol: type, room, reason; details open the dialog. */
    _openBubble(id, item) {
        const hass = this.hass;
        const s = this.toScreen(this.toImage(item));
        const rect = this._stageRect();
        const lines = [item.type, [item.room, item.reason].filter(Boolean).join(' · ')].filter(Boolean).map((text, i) => {
            const line = document.createElement(i ? 'span' : 'strong');
            line.className = 'map-bubble-line';
            line.textContent = String(text);
            return line;
        });
        const details = BuschUI.action({ label: translate(hass, 'details'), text: translate(hass, 'details'), variant: 'quiet', onClick: () => {
            this._closeBubble();
            this.card._openDialog(this._obstacleView(id));
        } });
        details.setAttribute('data-action', 'obstacle-details');
        const close = BuschUI.action({ label: translate(hass, 'schliessen'), icon: 'mdi:close', variant: 'icon-only', onClick: () => this._closeBubble() });
        close.setAttribute('data-action', 'bubble-close');
        const text = document.createElement('div');
        text.className = 'map-bubble-text';
        text.append(...lines);
        this.bubble.replaceChildren(text, details, close);
        this.bubble.setAttribute('aria-label', translate(hass, 'hindernis'));
        this.bubble.setAttribute('data-obstacle', String(id));
        // Above the symbol (below it in the upper half), kept inside the stage.
        const y = s ? s.y - rect.top : 8;
        this.bubble.style.setProperty('--bvc-bubble-y', y + 'px');
        this.bubble.toggleAttribute('data-below', y < rect.height / 2);
        this.bubble.hidden = false;
    }

    _closeBubble() {
        this.bubble.hidden = true;
    }

    _obstacleUrl(id, file) {
        const a = this._attrs();
        return this._url('/api/camera_map_obstacle_proxy/' + this._cameraId + '?token=' + encodeURIComponent(a.access_token || '') + '&index=' + encodeURIComponent(id) + (file ? '&file=1' : ''));
    }

    /** Details: facts, photo only when there is one, download, ignore/undo, actions of other modules. */
    _obstacleView(id) {
        return {
            title: translate(this.hass, 'hindernis'),
            kind: 'menu',
            watch: () => [this._cameraId, this.card._opts.entity],
            render: (body, hass) => {
                const model = this.card._model();
                const cam = hass.states[this._cameraId];
                const item = cam && cam.attributes.obstacles && cam.attributes.obstacles[id];
                const notes = document.createElement('div');
                notes.className = 'obstacle-note';
                const note = (key) => {
                    const p = document.createElement('p');
                    p.textContent = translate(hass, key);
                    notes.appendChild(p);
                };
                if (!item) {
                    note('hindernisWeg');
                    body.appendChild(notes);
                    return;
                }
                const status = String(item.ignore_status || '');
                const ignored = /ignored/i.test(status) && !/not/i.test(status);
                const auto = /automatic/i.test(status);
                const facts = document.createElement('dl');
                facts.className = 'obstacle-facts';
                for (const [key, value] of [['hindernisTyp', item.type], ['hindernisRaum', item.room], ['hindernisGrund', item.reason], ['hindernisStatus', translate(hass, ignored ? 'ignoriert' : 'nichtIgnoriert')]]) {
                    if (value === undefined || value === null || value === '') continue;
                    const dt = document.createElement('dt');
                    dt.textContent = translate(hass, key);
                    const dd = document.createElement('dd');
                    dd.textContent = String(value);
                    facts.append(dt, dd);
                }
                body.appendChild(facts);
                const picture = String(item.picture_status || '').toLowerCase();
                const actions = document.createElement('div');
                actions.className = 'actions';
                if (picture === 'uploaded') {
                    const img = document.createElement('img');
                    img.className = 'obstacle-photo';
                    img.setAttribute('src', this._obstacleUrl(id));
                    img.setAttribute('alt', translate(hass, 'fotoAlt'));
                    body.appendChild(img);
                    const link = document.createElement('a');
                    link.className = 'busch-ui-action link-action';
                    link.setAttribute('data-action', 'obstacle-download');
                    link.setAttribute('href', this._obstacleUrl(id, true));
                    link.setAttribute('download', '');
                    link.textContent = translate(hass, 'fotoLaden');
                    actions.appendChild(link);
                } else note(picture === 'uploading' ? 'fotoLaedt' : 'fotoFehlt');
                if (model.can('dreame_vacuum.vacuum_set_obstacle_ignore')) {
                    const busy = taskActive(model, model.state ? model.state.state : 'unavailable');
                    const pending = this._ignorePending && this._ignorePending.id === id && this._ignorePending.wanted !== ignored;
                    if (busy) note('ignorierenGesperrt');
                    if (auto) note('autoIgnoriert');
                    const label = translate(hass, ignored ? 'nichtIgnorieren' : 'ignorieren');
                    const button = BuschUI.action({ label, text: label, variant: 'secondary', disabled: busy || auto || pending, onClick: () => this._setIgnore(id, item, !ignored) });
                    button.setAttribute('data-action', 'obstacle-ignore');
                    if (pending) button.setAttribute('aria-busy', 'true');
                    actions.appendChild(button);
                }
                for (const [name, action] of this._obstacleActions) {
                    const button = BuschUI.action({ label: action.label, text: action.label, icon: action.icon, variant: 'secondary', onClick: () => action.run(Object.assign({ id }, item)) });
                    button.setAttribute('data-action', 'obstacle-' + name);
                    actions.appendChild(button);
                }
                if (notes.childNodes.length) body.appendChild(notes);
                if (actions.childNodes.length) body.appendChild(actions);
            }
        };
    }

    /** Ignore or undo at once (R13: reversible instead of asking); one call until the device answers (R11). */
    _setIgnore(id, item, wanted) {
        if (this._ignorePending && this._ignorePending.id === id) return;
        const pending = { id, wanted, timer: null };
        const done = () => {
            if (this._ignorePending !== pending) return;
            clearTimeout(pending.timer);
            this._ignorePending = null;
            if (this.card._dialog) this.card._dialog._render();
        };
        pending.timer = setTimeout(done, OPTIMISTIC_HOLD_MS * 2);
        this._ignorePending = pending;
        Promise.resolve(this.hass.callService('dreame_vacuum', 'vacuum_set_obstacle_ignore', { entity_id: this.card._opts.entity, x: item.x, y: item.y, obstacle_ignored: wanted })).catch(done);
        if (this.card._dialog) this.card._dialog._render();
    }

    // ── Floors (MAP-07) ───────────────────────────────────────────────────

    _maps() {
        const maps = this.model && this.model.attr('maps');
        return Array.isArray(maps) ? maps.filter((m) => m && m.id !== undefined) : [];
    }

    _activeMapId() {
        const entry = this._maps().find((m) => m.index === this._attrs().map_index);
        return entry ? entry.id : null;
    }

    _busy() {
        return !!this.model && taskActive(this.model, this.model.state ? this.model.state.state : 'unavailable');
    }

    /** Contract: change the floor, only through core's confirmation (CORE-20); false when refused. */
    selectMap(mapId) {
        const entry = this._maps().find((m) => String(m.id) === String(mapId));
        if (!entry || this._busy() || entry.id === this._activeMapId()) return false;
        const name = entry.custom_name || entry.name || String(entry.id);
        this.card._confirmMapChange(name, () => this.hass.callService('dreame_vacuum', 'vacuum_select_map', { entity_id: this.card._opts.entity, map_id: entry.id }));
        return true;
    }

    /** Saved-map camera of a floor (camera.*_map_N), for its preview. */
    _floorCamera(index) {
        return this.model.related.maps.saved_map.find((id) => this.hass.states[id] && this.hass.states[id].attributes.map_index === index) || null;
    }

    _floorsView() {
        return {
            title: translate(this.hass, 'stockwerkWaehlen'),
            kind: 'menu',
            // Other cameras are watched only while this dialog is open.
            watch: () => [this.card._opts.entity, ...this._maps().map((m) => this._floorCamera(m.index)).filter(Boolean)],
            render: (body, hass, dialog) => {
                const list = document.createElement('div');
                list.className = 'menu floors';
                const active = this._activeMapId();
                for (const entry of this._maps()) {
                    const name = entry.custom_name || entry.name || String(entry.id);
                    const current = entry.id === active;
                    const button = BuschUI.action({ label: current ? name + ' · ' + translate(hass, 'aktiveKarte') : name, variant: 'quiet', disabled: this._busy() && !current, onClick: () => {
                        if (current) dialog.close();
                        else this.selectMap(entry.id);
                    } });
                    button.classList.add('menu-item', 'floor');
                    button.setAttribute('data-map', String(entry.id));
                    if (current) button.setAttribute('aria-current', 'true');
                    const cam = this._floorCamera(entry.index);
                    const picture = cam && hass.states[cam].attributes.entity_picture;
                    if (picture) {
                        const img = document.createElement('img');
                        img.className = 'floor-preview';
                        img.setAttribute('src', this._url(picture));
                        img.setAttribute('alt', '');
                        img.setAttribute('loading', 'lazy');
                        button.appendChild(img);
                    }
                    const text = document.createElement('span');
                    text.className = 'floor-name';
                    text.textContent = current ? name + ' · ' + translate(hass, 'aktiveKarte') : name;
                    button.appendChild(text);
                    list.appendChild(button);
                }
                body.appendChild(list);
            }
        };
    }

    // ── Layers (MAP-03) ───────────────────────────────────────────────────

    /** An SVG element with attributes; layers draw with it. */
    svgNode(tag, attrs) {
        const node = document.createElementNS(SVG_NS, tag);
        for (const [key, value] of Object.entries(attrs || {})) if (value !== undefined && value !== null) node.setAttribute(key, String(value));
        return node;
    }

    /** A screen-sized symbol at a robot point: its own scale, never the zoom's. */
    _symbol(robot, kind, id, { upright = true, angle = 0 } = {}) {
        const p = this.toImage(robot);
        if (!p) return null;
        const g = this.svgNode('g', { 'data-object': id, 'data-symbol': kind });
        g.style.transform = 'translate(' + p.x + 'px, ' + p.y + 'px) scale(var(--bvc-map-symbol))' + (upright ? ' rotate(var(--bvc-map-turn))' : ' rotate(' + angle + 'deg)');
        const icon = this.card._opts && this.card._opts.icon_set === 'material' && MATERIAL_ICONS[kind];
        if (icon) {
            // mdi icons need HTML: a foreignObject of 24 screen px around the point.
            const box = this.svgNode('foreignObject', { x: -12, y: -12, width: 24, height: 24, class: 'material' });
            const holder = document.createElement('div');
            holder.className = 'material-icon';
            holder.appendChild(BuschUI.ha.icon(icon));
            box.appendChild(holder);
            g.appendChild(box);
        } else for (const [tag, attrs] of MAP_SYMBOLS[kind] || []) g.appendChild(this.svgNode(tag, attrs));
        return g;
    }

    _ctx() {
        return Object.assign(this.current(), { toImage: (p) => this.toImage(p), svgNode: (tag, attrs) => this.svgNode(tag, attrs), data: this._data, model: this.model });
    }

    /** Contract: a layer of another module. `render(group, ctx)` draws in image px; `hit(point, ctx)` answers taps. */
    addLayer(id, spec) {
        this.removeLayer(id);
        const group = this.svgNode('g', { 'data-layer': id });
        const layer = Object.assign({ z: 0, renders: 0, sig: null, builtIn: false }, spec, { group });
        const above = Array.from(this._layers.values()).filter((l) => l.z > layer.z).sort((x, y) => x.z - y.z)[0];
        this.svg.insertBefore(group, above ? above.group : null);
        this._layers.set(id, layer);
        this._renderLayer(layer, true);
        return group;
    }

    removeLayer(id) {
        const layer = this._layers.get(id);
        if (!layer) return;
        layer.group.remove();
        this._layers.delete(id);
    }

    /** Draws a layer again (all layers without id), e.g. after a module changed its own state. */
    refresh(id) {
        if (id !== undefined) {
            const layer = this._layers.get(id);
            if (layer) this._renderLayer(layer, true);
        } else for (const layer of this._layers.values()) this._renderLayer(layer, true);
        // A module's selection may show on the chips too (pick-room).
        this._renderChips();
    }

    _renderLayers() {
        for (const layer of this._layers.values()) this._renderLayer(layer, false);
        this._placeRobot();
    }

    _renderLayer(layer, force) {
        if (!this.model) return;
        const ctx = this._ctx();
        const shown = !layer.builtIn || this.visible(layer.name);
        const options = this.config(ctx.index);
        // Built-in layers redraw when their source changed; module layers when the map or frame did.
        const sig = JSON.stringify([ctx.calibration, shown, options.font_size, layer.builtIn ? layer.source(ctx) : ctx.frameId]);
        if (!force && sig === layer.sig) return;
        layer.sig = sig;
        layer.group.hidden = !shown;
        layer.group.replaceChildren();
        if (!ctx.calibration || !shown) return;
        layer.renders++;
        layer.render(layer.group, ctx);
    }

    _addBuiltIn(name, z, kind) {
        const draw = MAP_DRAW[kind];
        this.addLayer(name, {
            z, name, builtIn: true,
            source: (ctx) => draw.source(this, name, ctx),
            render: (group, ctx) => draw.render(this, name, group, ctx),
            hit: draw.hit ? (point, ctx) => draw.hit(this, name, point, ctx) : undefined
        });
    }

    /** Robot movement: one transform on the existing symbol (R20). */
    _placeRobot() {
        const layer = this._layers.get('robot');
        const node = layer && layer.group.firstChild;
        const pos = this._attrs().vacuum_position;
        if (!node || !pos || !this._matrix) return;
        const p = this.toImage(pos);
        const m = this._matrix;
        const rad = (Number(pos.a) || 0) * Math.PI / 180;
        const angle = Math.atan2(m.b * Math.cos(rad) + m.d * Math.sin(rad), m.a * Math.cos(rad) + m.c * Math.sin(rad)) * 180 / Math.PI;
        node.style.transform = 'translate(' + p.x + 'px, ' + p.y + 'px) scale(var(--bvc-map-symbol)) rotate(' + Math.round(angle) + 'deg)';
    }

    /** Card options merged with `map_config.map_<index>`; hidden objects add up. */
    config(index) {
        const opts = this.card._opts || {};
        const own = (opts.map_config && opts.map_config['map_' + index]) || {};
        return Object.assign({}, MAP_CONFIG_DEFAULTS, own, {
            hidden_objects: [...new Set([...(opts.hidden_objects || []), ...(own.hidden_objects || [])])]
        });
    }

    /** Whether an object kind shows on the current map (`hidden_objects`, card and per map). */
    visible(name) {
        return !this.config(this._attrs().map_index).hidden_objects.includes(name);
    }

    // ── Contract ──────────────────────────────────────────────────────────

    current() {
        const a = this._attrs();
        return {
            camera: this._cameraId || null,
            mapId: a.map_id !== undefined ? a.map_id : null,
            index: a.map_index !== undefined ? a.map_index : null,
            name: this._mapName(),
            calibration: this._matrix,
            rooms: a.rooms || {},
            objects: a,
            frameId: a.frame_id !== undefined ? a.frame_id : null,
            updatedAt: a.updated_at || null,
            mode: this._data ? 'data' : 'image'
        };
    }

    /** Robot mm → image px, or null without calibration. */
    toImage(p) {
        return this._matrix && p ? applyAffine(this._matrix, p) : null;
    }

    /** Image px → robot mm, or null without calibration. */
    toRobot(p) {
        const inverse = this._matrix && invertAffine(this._matrix);
        return inverse && p ? applyAffine(inverse, p) : null;
    }
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Settings views (device-settings): overview → group → entry, at most three levels (R25)
// ---------------------------------------------------------------------------

const groupKeys = (name) => Object.keys(SETTINGS).filter((key) => SETTINGS[key].group === name);

/** Whether a group has anything on this device; empty groups do not appear (R18). */
function groupShown(model, name) {
    switch (name) {
        case 'station': return model.can('dock');
        case 'consumables': return model.can('consumables');
        case 'info': return !!model.state;
        case 'schedule': return Array.isArray(model.attr('schedule'));
        case 'dnd': return model.can('dnd_task') || groupKeys(name).some((key) => settingValue(model, key).source !== null);
        case 'audio': return model.attr('voice_packet_id') !== undefined || groupKeys(name).some((key) => settingValue(model, key).source !== null);
        default: return groupKeys(name).some((key) => settingValue(model, key).source !== null);
    }
}

/** The integration's entity names (R26) arrive once per card; the dialog redraws when they are there. */
function loadSettingTexts(card) {
    const hass = card._hass;
    if (card._settingTexts || !hass || typeof hass.loadBackendTranslation !== 'function') return;
    card._settingTexts = Promise.resolve(hass.loadBackendTranslation('entity', 'dreame_vacuum')).then(() => rerender(card), () => {});
}

/** A settings view redraws when the vacuum or any entity of its device changes. */
const settingsWatch = (card) => {
    const model = card._model();
    return [card._opts.entity, ...Object.values(model.related.device), ...model.related.maps.map.slice(0, 1)];
};

/** Menu entries filled by a module; the others keep core's placeholder until theirs arrives. */
const MODULE_VIEWS = {
    settings: (card) => settingsView(card),
    consumables: (card) => groupView(card, 'consumables'),
    cleaning_sequence: (card) => sequenceView(card),
    history: (card) => historyView(card, 'history'),
    cruising_history: (card) => historyView(card, 'cruising_history'),
    remote: (card) => remoteView(card)
};

/** Rows of device-settings (not dock's or clean-settings'), for the search (R14). */
const searchableKeys = () => Object.keys(SETTINGS).filter((key) => !['station', 'clean'].includes(SETTINGS[key].group));

function settingsView(card) {
    loadSettingTexts(card);
    let query = ''; // survives redraws while the view is open; a new visit starts empty (R21)
    return {
        title: translate(card._hass, 'entrySettings'),
        kind: 'editor',
        watch: () => settingsWatch(card),
        render: (body, hass, dialog) => {
            const model = card._model();
            const search = document.createElement('input');
            search.className = 'settings-search setting-input';
            search.setAttribute('type', 'search');
            search.setAttribute('aria-label', translate(hass, 'sucheLabel'));
            search.setAttribute('placeholder', translate(hass, 'sucheLabel'));
            search.value = query;
            const count = document.createElement('p');
            count.className = 'search-count';
            count.setAttribute('role', 'status');
            const results = document.createElement('div');
            const fill = () => {
                const words = query.trim().toLowerCase();
                if (!words) {
                    count.hidden = true;
                    const list = document.createElement('div');
                    list.className = 'menu settings-groups';
                    for (const group of SETTING_GROUPS.filter((g) => groupShown(model, g.name))) {
                        const label = translate(hass, 'gruppe_' + group.name);
                        const item = BuschUI.action({ label, text: label, icon: group.icon, variant: 'quiet', onClick: () => dialog.show(groupView(card, group.name)) });
                        item.classList.add('menu-item');
                        item.setAttribute('data-group', group.name);
                        list.appendChild(item);
                    }
                    results.replaceChildren(list);
                    return;
                }
                // Only the input's results redraw while typing; the field keeps focus and caret.
                const rows = searchableKeys().filter((key) => settingLabel(hass, key).toLowerCase().includes(words))
                    .map((key) => settingRow(card, model, key)).filter(Boolean);
                count.hidden = false;
                count.textContent = rows.length ? translate(hass, 'treffer', { n: rows.length }) : translate(hass, 'keineTreffer');
                const list = document.createElement('div');
                list.className = 'settings-list';
                list.append(...rows);
                results.replaceChildren(list);
            };
            search.addEventListener('input', () => { query = search.value; fill(); });
            fill();
            body.append(search, count, results);
        }
    };
}

function groupView(card, name) {
    if (name === 'station') return stationView(card);
    loadSettingTexts(card);
    const group = SETTING_GROUPS.find((g) => g.name === name);
    return {
        title: translate(card._hass, 'gruppe_' + name),
        kind: 'editor',
        watch: () => settingsWatch(card),
        render: (body, hass, dialog) => {
            const model = card._model();
            if (group.module) {
                const note = document.createElement('p');
                note.className = 'placeholder';
                note.textContent = translate(hass, 'platzhalter', { modul: group.module });
                body.appendChild(note);
                return;
            }
            if (GROUP_HEAD[name]) GROUP_HEAD[name](card, model, body, hass, dialog);
            const list = document.createElement('div');
            list.className = 'settings-list';
            for (const key of groupKeys(name)) {
                const row = settingRow(card, model, key);
                if (row) list.appendChild(row);
            }
            body.appendChild(list);
            if (GROUP_EXTRAS[name]) GROUP_EXTRAS[name](card, model, body, hass, dialog);
        }
    };
}

/** A link to a deeper view, styled as a menu entry. */
function viewLink(label, action, icon, onClick) {
    const link = BuschUI.action({ label, text: label, icon, variant: 'quiet', onClick });
    link.classList.add('menu-item');
    link.setAttribute('data-action', action);
    return link;
}

/** A read-only line in a settings list: name and value as text. */
function infoRow(label, value, name) {
    const row = document.createElement('div');
    row.className = 'setting';
    row.setAttribute('data-info', name);
    const text = document.createElement('div');
    text.className = 'setting-text';
    const caption = document.createElement('span');
    caption.className = 'setting-name';
    caption.textContent = label;
    text.appendChild(caption);
    const shown = document.createElement('span');
    shown.className = 'setting-value';
    shown.textContent = value;
    row.append(text, shown);
    return row;
}

/**
 * Weekdays of a schedule: `repeats` is positional from the left, Sunday first
 * — character d is Date#getDay d (app example 10.11.2026: Monday + Wednesday =
 * "0101000", written back live with the user's OK, attribute unchanged).
 * Inside the card a day set is a mask with bit d = day d.
 * DnD periods have no weekdays in the Dreame app: their `wk` passes unchanged.
 */
const WEEKDAY_BIT = (day) => 1 << day;
const daysOfMask = (mask) => [0, 1, 2, 3, 4, 5, 6].filter((day) => (Number(mask) & WEEKDAY_BIT(day)) !== 0);
const maskOfDays = (days) => days.reduce((mask, day) => mask | WEEKDAY_BIT(day), 0);
// The integration pads shorter strings on the left (zfill(7), device.py#L1745) before they reach us.
const maskOfRepeats = (text) => (/^[01]{7}$/.test(String(text)) ? maskOfDays([...String(text)].map((c, day) => (c === '1' ? day : -1)).filter((day) => day >= 0)) : 0);
const repeatsOfMask = (mask) => [0, 1, 2, 3, 4, 5, 6].map((day) => ((Number(mask) & WEEKDAY_BIT(day)) !== 0 ? '1' : '0')).join('');

/** Weekdays from HA's first day of the week (CORE-16), as getDay numbers. */
const weekOrder = (hass) => [0, 1, 2, 3, 4, 5, 6].map((i) => (firstWeekday(hass) + i) % 7);
const dayName = (hass, day, style = 'short') => new Intl.DateTimeFormat(localeOf(hass).language, { weekday: style }).format(new Date(2023, 0, 1 + day));

function daysText(hass, mask) {
    if (Number(mask) === 127) return translate(hass, 'taeglich');
    const days = daysOfMask(mask);
    if (!days.length) return translate(hass, 'einmalig');
    return weekOrder(hass).filter((day) => days.includes(day)).map((day) => dayName(hass, day)).join(', ');
}

/** Clock text of an `HH:MM` value in HA's 12/24 h setting. */
const timeText = (hass, value) => (/^\d{1,2}:\d{2}$/.test(String(value)) ? clockText(hass, Number(value.split(':')[0]), Number(value.split(':')[1])) : String(value || '?'));

const dndTasks = (model) => (Array.isArray(model.attr('dnd')) ? model.attr('dnd').filter((t) => t && t.id !== undefined) : []);

/**
 * The integration's own wire form of a period (set_dnd_tasks, device.py#L4255ff):
 * `en` as a boolean like the integration sends it, `wk` and `ss` unchanged.
 */
const dndWire = (t) => ({ id: Number(t.id), en: !!t.enabled, st: t.start, et: t.end, wk: Number(t.repeats), ss: t.ss === undefined || t.ss === null ? 0 : Number(t.ss) });
/**
 * Adding and deleting periods only where the device already reports several:
 * the X40 rejected a second period live (10.11.2026, "Property not updated:
 * DND_TASK"), the Dreame app and set_dnd_tasks edit just one.
 */
const dndMany = (model) => dndTasks(model).length > 1;
const dndJson = (list) => JSON.stringify(list.map(dndWire).sort((a, b) => a.id - b.id));

/**
 * DnD periods change only as the whole list (`vacuum_set_property { key:
 * 'dnd_task', value: <JSON> }`, check device.py#L2799): always built from the
 * current attribute, so other periods stay as they are.
 */
function writeDnd(card, model, list) {
    const value = dndJson(list);
    return trackWrite(card, 'dnd_task', {
        label: translate(card._hass, 'gruppe_dnd'),
        check: (m) => dndJson(dndTasks(m)) === value,
        call: () => card._hass.callService('dreame_vacuum', 'vacuum_set_property', { entity_id: card._opts.entity, key: 'dnd_task', value })
    });
}

const periodText = (hass, t) => timeText(hass, t.start) + ' – ' + timeText(hass, t.end);

/** A switch button for list entries (period, schedule): role switch, state as a word (R16/R17). */
function entrySwitch(hass, label, on, busy, onClick) {
    const toggle = BuschUI.action({ label, text: translate(hass, on ? 'an' : 'aus'), variant: on ? 'primary' : 'secondary', disabled: busy, onClick });
    toggle.classList.add('setting-switch');
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-checked', String(!!on));
    if (busy) toggle.setAttribute('aria-busy', 'true');
    return toggle;
}

/** Busy or failed state of a list write (dnd_task, schedule), in words. */
function writeStatus(card, hass, key, className) {
    const line = document.createElement('p');
    line.className = 'form-note ' + className;
    line.setAttribute('role', 'status');
    const note = card._settingNotes.get(key);
    if (card._settingWrites.has(key)) line.textContent = translate(hass, 'speichert');
    else if (note) {
        line.setAttribute('data-kind', 'error');
        line.textContent = note + (card._drafts.has(key + ':failed') ? ' ' + translate(hass, 'eingabenBleiben') : '');
    }
    return line;
}

/** Periods (DEV-06): list with on/off, edit, add; options follow as rows. */
function dndPeriods(card, model, body, hass, dialog) {
    if (!model.can('dnd_task')) return;
    const tasks = dndTasks(model).slice().sort((a, b) => String(a.start).localeCompare(String(b.start)));
    const busy = card._settingWrites.has('dnd_task');
    const sent = card._drafts.get('dnd_task:failed');
    if (sent && !busy) {
        // Confirmed: the input is done. Failed: it goes back into its form for the retry (R12).
        if (!card._settingNotes.has('dnd_task')) card._drafts.delete('dnd_task:failed');
        else if (!sent.restored) {
            sent.restored = true;
            card._drafts.set(sent.key, sent.draft);
        }
    }
    body.appendChild(writeStatus(card, hass, 'dnd_task', 'dnd-status'));
    const list = document.createElement('div');
    list.className = 'settings-list';
    for (const t of tasks) {
        const row = document.createElement('div');
        row.className = 'setting';
        row.setAttribute('data-dnd', String(t.id));
        const text = document.createElement('div');
        text.className = 'setting-text';
        const name = document.createElement('span');
        name.className = 'setting-name';
        name.textContent = periodText(hass, t);
        text.append(name);
        const label = translate(hass, 'zeitraum') + ' ' + periodText(hass, t);
        const toggle = entrySwitch(hass, label, t.enabled, busy, () => writeDnd(card, model, dndTasks(model).map((x) => (x.id === t.id ? Object.assign({}, x, { enabled: !x.enabled }) : x))));
        const edit = BuschUI.action({ label: translate(hass, 'bearbeitenVon', { name: label }), icon: 'mdi:pencil-outline', variant: 'icon-only', onClick: () => dialog.show(dndForm(card, t.id)) });
        edit.setAttribute('data-action', 'dnd-edit');
        row.append(text, toggle, edit);
        list.appendChild(row);
    }
    if (!tasks.length) {
        const empty = document.createElement('p');
        empty.className = 'form-note dnd-empty';
        empty.textContent = translate(hass, 'keineZeitraeume');
        body.appendChild(empty);
    }
    body.appendChild(list);
    if (dndMany(model)) body.appendChild(viewLink(translate(hass, 'zeitraumNeu'), 'dnd-add', 'mdi:plus', () => dialog.show(dndForm(card, null))));
}

/** Day toggles in HA's week order: one button per day, `aria-pressed` (R16). */
function dayPicker(hass, draft, onChange) {
    const group = document.createElement('div');
    group.className = 'day-picker';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-labelledby', 'field-days-label');
    for (const day of weekOrder(hass)) {
        const pressed = daysOfMask(draft.mask).includes(day);
        const button = BuschUI.action({ label: dayName(hass, day, 'long'), text: dayName(hass, day), variant: pressed ? 'primary' : 'secondary', onClick: () => {
            draft.mask ^= WEEKDAY_BIT(day);
            onChange();
        } });
        button.setAttribute('aria-pressed', String(pressed));
        button.setAttribute('data-day', String(day));
        group.appendChild(button);
    }
    return group;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function dndErrors(draft) {
    const errors = {};
    if (!TIME_PATTERN.test(draft.start)) errors.start = 'fehlerZeit';
    if (!TIME_PATTERN.test(draft.end)) errors.end = 'fehlerZeit';
    else if (draft.start === draft.end) errors.end = 'fehlerGleich';
    return errors;
}

/** Labelled heading for a group of toggles (days), with its inline error. */
function fieldGroup(id, label, control, error) {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const caption = document.createElement('span');
    caption.className = 'field-label';
    caption.id = id + '-label';
    caption.textContent = label;
    const message = document.createElement('span');
    message.className = 'field-error';
    message.textContent = error || '';
    wrap.append(caption, control, message);
    return wrap;
}

/**
 * Add or edit one period (level three, R25). The draft stays on the card when
 * the form is left (R04/R10) and is marked unsaved; „Verwerfen“ restores it.
 */
function dndForm(card, id) {
    const hass0 = card._hass;
    const draftKey = 'dnd:' + (id === null ? 'new' : id);
    const model0 = card._model();
    const original = id === null ? null : dndTasks(model0).find((t) => t.id === id);
    const initial = () => (original ? { start: original.start, end: original.end, enabled: !!original.enabled }
        : { start: '22:00', end: '08:00', enabled: true });
    if (!card._drafts.has(draftKey)) card._drafts.set(draftKey, initial());
    let checked = false;
    return {
        title: translate(hass0, id === null ? 'zeitraumNeu' : 'zeitraumBearbeiten'),
        kind: 'editor',
        watch: () => [],
        render: (body, hass, dialog) => {
            const draft = card._drafts.get(draftKey) || initial();
            card._drafts.set(draftKey, draft);
            const dirty = JSON.stringify(draft) !== JSON.stringify(initial());
            if (dirty) body.appendChild(noteLine(translate(hass, 'ungespeichert'), 'dirty'));
            const errors = checked ? dndErrors(draft) : {};
            const redraw = () => dialog._render();
            for (const name of ['start', 'end']) {
                const input = document.createElement('input');
                input.setAttribute('type', 'time');
                input.setAttribute('aria-required', 'true');
                input.value = draft[name];
                const field = formField(name, translate(hass, 'feld_' + name), input, errors[name] ? translate(hass, errors[name]) : '');
                input.addEventListener('input', () => {
                    const was = JSON.stringify(draft) !== JSON.stringify(initial());
                    draft[name] = input.value;
                    if (checked) field.update(dndErrors(draft)[name] ? translate(hass, dndErrors(draft)[name]) : '');
                    if (was !== (JSON.stringify(draft) !== JSON.stringify(initial()))) redraw();
                });
                body.appendChild(field.wrap);
            }
            const actions = document.createElement('div');
            actions.className = 'actions';
            if (original && dndMany(card._model())) {
                const remove = BuschUI.action({ label: translate(hass, 'loeschen'), text: translate(hass, 'loeschen'), variant: 'destructive', onClick: () => dialog.show(dndDelete(card, original)) });
                remove.setAttribute('data-action', 'delete');
                actions.appendChild(remove);
            }
            if (dirty) {
                const discard = BuschUI.action({ label: translate(hass, 'verwerfen'), text: translate(hass, 'verwerfen'), onClick: () => { card._drafts.set(draftKey, initial()); checked = false; redraw(); } });
                discard.setAttribute('data-action', 'discard');
                actions.appendChild(discard);
            }
            const save = BuschUI.action({ label: translate(hass, 'speichern'), text: translate(hass, 'speichern'), variant: 'primary', disabled: card._settingWrites.has('dnd_task'), onClick: () => {
                checked = true;
                if (Object.keys(dndErrors(draft)).length) return redraw();
                const model = card._model();
                const tasks = dndTasks(model);
                const nextId = tasks.reduce((max, t) => Math.max(max, Number(t.id)), 0) + 1;
                // New periods (only where the device has several) repeat every day: wk 127 as set_dnd_tasks.
                const entry = { id: original ? original.id : nextId, enabled: draft.enabled, start: draft.start, end: draft.end, repeats: original ? original.repeats : 127, ss: original ? original.ss : 0 };
                const list = original ? tasks.map((t) => (t.id === original.id ? Object.assign({}, t, entry) : t)) : tasks.concat(entry);
                if (!writeDnd(card, model, list)) return undefined;
                // Kept until the device confirms: a failed write leaves the input to retry (R12).
                card._drafts.delete(draftKey);
                card._drafts.set('dnd_task:failed', { key: draftKey, draft });
                dialog.back(1);
                return undefined;
            } });
            save.setAttribute('data-action', 'save');
            actions.appendChild(save);
            body.appendChild(actions);
        }
    };
}

/** R13: deleting a period names it; the integration deletes it by id (device.py#L4433). */
function dndDelete(card, task) {
    return {
        title: translate(card._hass, 'zeitraumLoeschenTitel'),
        kind: 'confirm',
        watch: () => [],
        render: (body, hass, dialog) => {
            body.appendChild(noteLine(translate(hass, 'zeitraumLoeschenFrage', { zeitraum: periodText(hass, task) })));
            const actions = document.createElement('div');
            actions.className = 'actions';
            const cancel = BuschUI.action({ label: translate(hass, 'abbrechen'), text: translate(hass, 'abbrechen'), onClick: () => dialog._goBack() });
            cancel.setAttribute('data-action', 'cancel');
            const go = BuschUI.action({ label: translate(hass, 'loeschen'), text: translate(hass, 'loeschen'), variant: 'destructive', onClick: () => {
                callAction(card, 'delete_dnd_task', String(task.id), { track: 'dnd_task', label: translate(hass, 'gruppe_dnd') });
                card._drafts.delete('dnd:' + task.id);
                dialog.back(2);
            } });
            go.setAttribute('data-action', 'confirm');
            actions.append(cancel, go);
            body.appendChild(actions);
        }
    };
}

/** Consumable parts (DEV-09): left in % and time, reset with a confirmation naming part and value (R13). */
function consumableParts(card, model, body, hass, dialog) {
    const list = document.createElement('div');
    list.className = 'settings-list';
    for (const [attribute, left] of Object.entries(model.consumables())) {
        const name = attribute.slice(0, -'_left'.length);
        const label = entityLabel(hass, 'sensor', attribute);
        const row = document.createElement('div');
        row.className = 'setting';
        row.setAttribute('data-part', name);
        const text = document.createElement('div');
        text.className = 'setting-text';
        const caption = document.createElement('span');
        caption.className = 'setting-name';
        caption.textContent = label;
        const percent = statText(hass, model, 'sensor.' + attribute, attribute, '%');
        const time = statText(hass, model, 'sensor.' + name + '_time_left', name + '_time_left', 'h');
        const status = document.createElement('span');
        status.className = 'setting-status';
        const note = card._settingNotes.get('reset:' + name);
        status.textContent = card._settingWrites.has('reset:' + name) ? translate(hass, 'speichert') : note || translate(hass, 'rest', { prozent: percent, zeit: time || '–' });
        row.setAttribute('data-state', note ? 'error' : left < 30 ? 'low' : 'ok');
        text.append(caption, status);
        const full = left >= 100;
        // At 100 % the integration refuses the reset (ACTION_AVAILABILITY, types.py#L2308).
        const reset = BuschUI.action({ label: translate(hass, 'zuruecksetzenVon', { name: label }), text: translate(hass, 'zuruecksetzen'), disabled: full || card._settingWrites.has('reset:' + name), onClick: () => dialog.show(resetConfirm(card, name, label, percent)) });
        reset.setAttribute('data-action', 'reset');
        if (full) reset.title = translate(hass, 'schonVoll');
        row.append(text, reset);
        list.appendChild(row);
    }
    body.appendChild(list);
    const sums = document.createElement('div');
    sums.className = 'settings-list';
    for (const key of ['total_cleaned_area', 'total_cleaning_time', 'total_runtime', 'total_cruise_time', 'cleaning_count', 'first_cleaning_date']) {
        const value = statText(hass, model, 'sensor.' + key, key, SUM_UNITS[key] || '');
        if (value !== null) sums.appendChild(infoRow(entityLabel(hass, 'sensor', key), String(value).trim(), key));
    }
    if (sums.childNodes.length) {
        const heading = document.createElement('h2');
        heading.className = 'settings-heading';
        heading.textContent = translate(hass, 'summen');
        body.append(heading, sums);
    }
}

/** Units of the attribute fallback; the sensors bring HA's own. */
const SUM_UNITS = { total_cleaned_area: 'm²', total_cleaning_time: 'min' };

function resetConfirm(card, name, label, percent) {
    return {
        title: translate(card._hass, 'zuruecksetzenTitel', { name: label }),
        kind: 'confirm',
        watch: () => [],
        render: (body, hass, dialog) => {
            body.appendChild(noteLine(translate(hass, 'zuruecksetzenFrage', { name: label, prozent: percent })));
            const actions = document.createElement('div');
            actions.className = 'actions';
            const cancel = BuschUI.action({ label: translate(hass, 'abbrechen'), text: translate(hass, 'abbrechen'), onClick: () => dialog._goBack() });
            cancel.setAttribute('data-action', 'cancel');
            const go = BuschUI.action({ label: translate(hass, 'zuruecksetzen'), text: translate(hass, 'zuruecksetzen'), variant: 'destructive', onClick: () => {
                const consumable = CONSUMABLES[name];
                if (consumable === null) callAction(card, 'reset_track_cleaning', undefined, { track: 'reset:' + name, label });
                else trackWrite(card, 'reset:' + name, { label, call: () => card._hass.callService('dreame_vacuum', 'vacuum_reset_consumable', { entity_id: card._opts.entity, consumable }) });
                dialog._goBack();
            } });
            go.setAttribute('data-action', 'confirm');
            actions.append(cancel, go);
            body.appendChild(actions);
        }
    };
}

/**
 * Device info and status (DEV-08), display only: HA's device registry first
 * (`hass.devices`), then the vacuum's attributes and sensors. Network shows
 * SSID and signal, never an address.
 */
function deviceInfo(card, model, body, hass) {
    const own = hass.entities && hass.entities[card._opts.entity];
    const device = (own && own.device_id && hass.devices && hass.devices[own.device_id]) || {};
    const rows = [];
    const add = (name, label, value) => {
        if (value !== undefined && value !== null && value !== '') rows.push(infoRow(label, String(value), name));
    };
    add('manufacturer', translate(hass, 'hersteller'), device.manufacturer);
    add('model', translate(hass, 'modell'), device.model);
    add('firmware', translate(hass, 'firmware'), device.sw_version || statText(hass, model, 'sensor.firmware_version', 'firmware_version', '').trim());
    add('serial_number', translate(hass, 'seriennummer'), device.serial_number);
    const ap = model.attr('ap') || {};
    add('ssid', translate(hass, 'wlan'), ap.ssid);
    add('rssi', translate(hass, 'signal'), ap.rssi !== undefined && ap.rssi !== null ? ap.rssi + ' dBm' : null);
    add('timezone', translate(hass, 'zeitzone'), model.attr('timezone'));
    for (const key of ['status', 'state', 'task_status', 'task_type', 'relocation_status', 'current_room']) {
        const value = statText(hass, model, 'sensor.' + key, key, '');
        add(key, entityLabel(hass, 'sensor', key), value === null ? null : String(value).trim());
    }
    if (model.can('dock')) {
        // ALL-12: the station's problems from dock's status function, else "all right".
        const problems = stationStatus(model).filter((s) => s.level === 'error' || s.level === 'warning').map((s) => s.label + ': ' + s.text);
        add('station', translate(hass, 'station'), problems.length ? problems.join('; ') : translate(hass, 'stationOk'));
    }
    const faults = model.attr('faults');
    if (faults !== undefined) {
        const list = faults && typeof faults === 'object' ? Object.values(faults).filter(Boolean) : [faults].filter(Boolean);
        add('faults', translate(hass, 'stoerungen'), list.length ? list.join(', ') : translate(hass, 'keine'));
    }
    const list = document.createElement('div');
    list.className = 'settings-list';
    list.append(...rows);
    body.appendChild(list);
}

/**
 * Schedules (DEV-01). The integration offers them only parsed (attribute
 * `schedule`, device.py#L1729ff) and takes them back only as one raw string
 * of all entries `id-flag-HH:MM-repeats-once-map-suction-water-options`
 * (`vacuum_set_property { key: 'schedule' }`, check device.py#L2780).
 * The parse loses the raw flag (1 and 2 are both enabled), everything after
 * the ninth field and the raw "repeat" marker (only `== "0"` = once is kept):
 * writing rebuilds every entry from what is shown — the view says so.
 */
const scheduleList = (model) => (Array.isArray(model.attr('schedule')) ? model.attr('schedule').filter((t) => t && t.id !== undefined) : []);

function scheduleRaw(t) {
    const flag = t.invalid ? '3' : t.enabled ? '1' : '0';
    const options = Array.isArray(t.options) && t.options.length ? t.options.join(',') : '0';
    // A repeating entry's raw marker is '1': written back live 10.11.2026 (user's OK), attribute unchanged.
    return [t.id, flag, t.time, t.repeats || '0000000', t.once ? '0' : '1', t.map_id, t.suction_level, t.water_volume, options].join('-');
}

const scheduleValue = (list) => list.slice().sort((a, b) => Number(a.id) - Number(b.id)).map(scheduleRaw).join(';');

function writeSchedule(card, list) {
    const value = scheduleValue(list);
    return trackWrite(card, 'schedule', {
        label: translate(card._hass, 'gruppe_schedule'),
        check: (m) => scheduleValue(scheduleList(m)) === value,
        call: () => card._hass.callService('dreame_vacuum', 'vacuum_set_property', { entity_id: card._opts.entity, key: 'schedule', value })
    });
}

const scheduleDays = (hass, t) => (t.once ? translate(hass, 'einmalig') : daysText(hass, maskOfRepeats(t.repeats)));

function scheduleMap(model, hass, mapId) {
    const entry = (model.attr('maps') || []).find((m) => String(m.id) === String(mapId));
    return entry ? entry.custom_name || entry.name : translate(hass, 'karteNr', { id: mapId });
}

/** What the entry cleans, as the integration gives it (codes, not guessed names). */
const scheduleCleaning = (model, hass, t) => translate(hass, 'planReinigung', { karte: scheduleMap(model, hass, t.map_id), saugen: t.suction_level, wasser: t.water_volume });

function scheduleEntries(card, model, body, hass, dialog) {
    const list = scheduleList(model).slice().sort((a, b) => String(a.time).localeCompare(String(b.time)) || b.id - a.id);
    const busy = card._settingWrites.has('schedule');
    body.appendChild(noteLine(translate(hass, 'planHinweis'), 'hint')).classList.add('schedule-hint');
    body.appendChild(writeStatus(card, hass, 'schedule', 'schedule-status'));
    const rows = document.createElement('div');
    rows.className = 'settings-list';
    for (const t of list) {
        const row = document.createElement('div');
        row.className = 'setting';
        row.setAttribute('data-schedule', String(t.id));
        const text = document.createElement('div');
        text.className = 'setting-text';
        const name = document.createElement('span');
        name.className = 'setting-name';
        name.textContent = timeText(hass, t.time) + ' · ' + scheduleDays(hass, t);
        const detail = document.createElement('span');
        detail.className = 'setting-status';
        detail.textContent = (t.invalid ? translate(hass, 'ungueltig') + ' · ' : '') + scheduleCleaning(model, hass, t);
        text.append(name, detail);
        const label = translate(hass, 'zeitplan') + ' ' + timeText(hass, t.time);
        const toggle = entrySwitch(hass, label, t.enabled && !t.invalid, busy || t.invalid,
            () => writeSchedule(card, scheduleList(model).map((x) => (x.id === t.id ? Object.assign({}, x, { enabled: !x.enabled }) : x))));
        const edit = BuschUI.action({ label: translate(hass, 'bearbeitenVon', { name: label }), icon: 'mdi:pencil-outline', variant: 'icon-only', onClick: () => dialog.show(scheduleForm(card, t.id)) });
        edit.setAttribute('data-action', 'schedule-edit');
        row.append(text, toggle, edit);
        rows.appendChild(row);
    }
    if (!list.length) body.appendChild(noteLine(translate(hass, 'keinePlaene'))).classList.add('schedule-empty');
    body.appendChild(rows);
    const add = viewLink(translate(hass, 'planNeu'), 'schedule-add', 'mdi:plus', () => dialog.show(scheduleForm(card, null)));
    // A new entry copies map, suction and water of an existing one: their codes are not documented.
    if (!list.length) add.disabled = true;
    body.appendChild(add);
}

function scheduleForm(card, id) {
    const draftKey = 'schedule:' + (id === null ? 'new' : id);
    const original = id === null ? null : scheduleList(card._model()).find((t) => t.id === id);
    const template = original || scheduleList(card._model())[0];
    const initial = () => ({ time: original ? original.time : '09:00', mask: original && !original.once ? maskOfRepeats(original.repeats) : 0, enabled: original ? !!original.enabled : true });
    if (!card._drafts.has(draftKey)) card._drafts.set(draftKey, initial());
    let checked = false;
    return {
        title: translate(card._hass, id === null ? 'planNeu' : 'planBearbeiten'),
        kind: 'editor',
        watch: () => [],
        render: (body, hass, dialog) => {
            const model = card._model();
            const draft = card._drafts.get(draftKey) || initial();
            card._drafts.set(draftKey, draft);
            const dirty = JSON.stringify(draft) !== JSON.stringify(initial());
            if (dirty) body.appendChild(noteLine(translate(hass, 'ungespeichert'), 'dirty'));
            const redraw = () => dialog._render();
            const input = document.createElement('input');
            input.setAttribute('type', 'time');
            input.setAttribute('aria-required', 'true');
            input.value = draft.time;
            const bad = checked && !TIME_PATTERN.test(draft.time);
            const field = formField('time', translate(hass, 'feld_time'), input, bad ? translate(hass, 'fehlerZeit') : '');
            input.addEventListener('input', () => {
                const was = JSON.stringify(draft) !== JSON.stringify(initial());
                draft.time = input.value;
                if (checked) field.update(TIME_PATTERN.test(draft.time) ? '' : translate(hass, 'fehlerZeit'));
                if (was !== (JSON.stringify(draft) !== JSON.stringify(initial()))) redraw();
            });
            body.appendChild(field.wrap);
            body.appendChild(fieldGroup('field-days', translate(hass, 'feld_days_plan'), dayPicker(hass, draft, redraw), ''));
            if (template) body.appendChild(noteLine(scheduleCleaning(model, hass, template)));
            const actions = document.createElement('div');
            actions.className = 'actions';
            if (original) {
                const remove = BuschUI.action({ label: translate(hass, 'loeschen'), text: translate(hass, 'loeschen'), variant: 'destructive', onClick: () => dialog.show(scheduleDelete(card, original)) });
                remove.setAttribute('data-action', 'delete');
                actions.appendChild(remove);
            }
            if (dirty) {
                const discard = BuschUI.action({ label: translate(hass, 'verwerfen'), text: translate(hass, 'verwerfen'), onClick: () => { card._drafts.set(draftKey, initial()); checked = false; redraw(); } });
                discard.setAttribute('data-action', 'discard');
                actions.appendChild(discard);
            }
            const save = BuschUI.action({ label: translate(hass, 'speichern'), text: translate(hass, 'speichern'), variant: 'primary', disabled: !template || card._settingWrites.has('schedule'), onClick: () => {
                checked = true;
                if (!TIME_PATTERN.test(draft.time)) return redraw();
                const list = scheduleList(card._model());
                const nextId = list.reduce((max, t) => Math.max(max, Number(t.id)), 0) + 1;
                const timing = { time: draft.time, repeats: repeatsOfMask(draft.mask), once: !draft.mask };
                const entry = original ? Object.assign({}, original, timing)
                    : Object.assign({ id: nextId, enabled: true, invalid: false, map_id: template.map_id, suction_level: template.suction_level, water_volume: template.water_volume, options: template.options }, timing);
                const next = original ? list.map((t) => (t.id === original.id ? entry : t)) : list.concat(entry);
                if (!writeSchedule(card, next)) return undefined;
                card._drafts.delete(draftKey);
                dialog.back(1);
                return undefined;
            } });
            save.setAttribute('data-action', 'save');
            actions.appendChild(save);
            body.appendChild(actions);
        }
    };
}

/** R13. The integration deletes one entry by id — the last one too (delete_scheduled_task, device.py#L4394). */
function scheduleDelete(card, task) {
    return {
        title: translate(card._hass, 'planLoeschenTitel'),
        kind: 'confirm',
        watch: () => [],
        render: (body, hass, dialog) => {
            body.appendChild(noteLine(translate(hass, 'planLoeschenFrage', { zeit: timeText(hass, task.time), tage: scheduleDays(hass, task) })));
            const actions = document.createElement('div');
            actions.className = 'actions';
            const cancel = BuschUI.action({ label: translate(hass, 'abbrechen'), text: translate(hass, 'abbrechen'), onClick: () => dialog._goBack() });
            cancel.setAttribute('data-action', 'cancel');
            const go = BuschUI.action({ label: translate(hass, 'loeschen'), text: translate(hass, 'loeschen'), variant: 'destructive', onClick: () => {
                callAction(card, 'delete_scheduled_task', String(task.id), { track: 'schedule', label: translate(hass, 'gruppe_schedule') });
                card._drafts.delete('schedule:' + task.id);
                dialog.back(2);
            } });
            go.setAttribute('data-action', 'confirm');
            actions.append(cancel, go);
            body.appendChild(actions);
        }
    };
}

/** What groups show above their rows. */
const GROUP_HEAD = {
    dnd: dndPeriods,
    consumables: consumableParts,
    info: deviceInfo,
    schedule: scheduleEntries
};

/** What groups show beyond their rows. */
const GROUP_EXTRAS = {
    // Water temperature, washing mode and frequency are dock's rows (ALL-03): one place, linked (R08).
    mopping: (card, model, body, hass, dialog) => {
        if (model.can('dock')) body.appendChild(viewLink(translate(hass, 'stationWaschen'), 'station', 'mdi:chevron-right', () => dialog.show(groupView(card, 'station'))));
    },
    // ALL-13: reload and manage shortcuts also when the device has none yet (the menu button needs content).
    other: (card, model, body, hass, dialog) => {
        if (model.can('shortcut_manage')) body.appendChild(viewLink(translate(hass, 'shortcutsVerwalten'), 'shortcuts-manage', 'mdi:chevron-right', () => dialog.show(shortcutManageView(card))));
    },
    audio: (card, model, body, hass, dialog) => {
        // Letter IDs like "DE" become None in set_property_value (device.py#L2916): shown, changed only by installing.
        if (model.attr('voice_packet_id') !== undefined) body.appendChild(infoRow(translate(hass, 'sprachpaket'), String(model.attr('voice_packet_id')), 'voice_packet_id'));
        if (model.can('dreame_vacuum.vacuum_install_voice_pack')) {
            const done = card._settingDone.get('voice_pack');
            if (done) body.appendChild(noteLine(done));
            body.appendChild(viewLink(translate(hass, 'sprachpaketTitel'), 'voice-pack', 'mdi:download-outline', () => dialog.show(voicePackView(card))));
        }
    }
};

function noteLine(text, kind) {
    const note = document.createElement('p');
    note.className = 'form-note';
    if (kind) note.setAttribute('data-kind', kind);
    note.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    note.textContent = text;
    return note;
}

/**
 * One labelled form field (R10): visible label, required marker for screen
 * readers, inline error under the field. `update(text)` changes only the error.
 */
function formField(name, label, input, error) {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    input.id = 'field-' + name;
    input.setAttribute('data-field', name);
    input.classList.add('setting-input');
    const caption = document.createElement('label');
    caption.setAttribute('for', input.id);
    caption.textContent = label;
    const message = document.createElement('span');
    message.className = 'field-error';
    message.id = input.id + '-error';
    input.setAttribute('aria-describedby', message.id);
    const update = (text) => {
        message.textContent = text || '';
        if (text) input.setAttribute('aria-invalid', 'true');
        else input.removeAttribute('aria-invalid');
    };
    update(error);
    wrap.append(caption, input, message);
    return { wrap, update };
}

/** Inline checks of the voice pack form; keys of the error texts. */
function voicePackErrors(draft) {
    const errors = {};
    if (!/^[A-Za-z0-9_-]{1,16}$/.test(draft.lang_id.trim())) errors.lang_id = 'fehlerSprachId';
    // The integration pastes url into a JSON string by hand (device.py#L5972): no quotes or blanks.
    if (!/^https?:\/\/[^\s"'\\<>]+$/i.test(draft.url.trim())) errors.url = 'fehlerUrl';
    if (!/^[0-9a-f]{32}$/i.test(draft.md5.trim())) errors.md5 = 'fehlerMd5';
    if (!/^[1-9]\d{0,11}$/.test(draft.size.trim())) errors.size = 'fehlerGroesse';
    return errors;
}

/**
 * DEV-02: voice pack install as a form (user's decision 10.11.2026); the
 * integration has no catalogue, so URL, MD5 and size come from the user.
 * The draft lives on the card: leaving and coming back keeps it (R10).
 */
function voicePackView(card) {
    const draft = card._drafts.get('voice') || { lang_id: '', url: '', md5: '', size: '' };
    card._drafts.set('voice', draft);
    let checked = false;
    return {
        title: translate(card._hass, 'sprachpaketTitel'),
        kind: 'editor',
        watch: () => [],
        render: (body, hass, dialog) => {
            body.appendChild(noteLine(translate(hass, 'sprachpaketHinweis')));
            const errors = checked ? voicePackErrors(draft) : {};
            const fields = {};
            for (const name of ['lang_id', 'url', 'md5', 'size']) {
                const input = document.createElement('input');
                input.setAttribute('type', name === 'url' ? 'url' : 'text');
                if (name === 'size') input.setAttribute('inputmode', 'numeric');
                input.setAttribute('aria-required', 'true');
                input.setAttribute('autocomplete', 'off');
                input.value = draft[name];
                const field = formField(name, translate(hass, 'feld_' + name), input, errors[name] ? translate(hass, errors[name]) : '');
                input.addEventListener('input', () => {
                    draft[name] = input.value;
                    if (checked) field.update(voicePackErrors(draft)[name] ? translate(hass, voicePackErrors(draft)[name]) : '');
                });
                fields[name] = field;
                body.appendChild(field.wrap);
            }
            const actions = document.createElement('div');
            actions.className = 'actions';
            const next = BuschUI.action({ label: translate(hass, 'weiter'), text: translate(hass, 'weiter'), variant: 'primary', onClick: () => {
                checked = true;
                if (Object.keys(voicePackErrors(draft)).length) dialog._render();
                else dialog.show(voicePackConfirm(card, draft));
            } });
            next.setAttribute('data-action', 'submit');
            actions.appendChild(next);
            body.appendChild(actions);
        }
    };
}

function voicePackConfirm(card, draft) {
    const data = { entity_id: card._opts.entity, lang_id: draft.lang_id.trim(), url: draft.url.trim(), md5: draft.md5.trim().toLowerCase(), size: Number(draft.size.trim()) };
    return {
        title: translate(card._hass, 'sprachpaketFrageTitel'),
        kind: 'confirm',
        watch: () => [],
        render: (body, hass, dialog) => {
            const busy = card._settingWrites.has('voice_pack');
            const failed = card._settingNotes.get('voice_pack');
            body.appendChild(noteLine(translate(hass, 'sprachpaketFrage', { id: data.lang_id, url: data.url, groesse: data.size })));
            if (failed) body.appendChild(noteLine(failed + ' ' + translate(hass, 'eingabenBleiben'), 'error'));
            const actions = document.createElement('div');
            actions.className = 'actions';
            const cancel = BuschUI.action({ label: translate(hass, 'abbrechen'), text: translate(hass, 'abbrechen'), onClick: () => dialog._goBack() });
            cancel.setAttribute('data-action', 'cancel');
            const go = BuschUI.action({ label: translate(hass, 'installieren'), text: translate(hass, busy ? 'speichert' : 'installieren'), variant: 'primary', disabled: busy, onClick: () => {
                trackWrite(card, 'voice_pack', {
                    label: translate(hass, 'sprachpaket'),
                    call: () => card._hass.callService('dreame_vacuum', 'vacuum_install_voice_pack', data),
                    done: () => {
                        card._drafts.delete('voice');
                        card._settingDone.set('voice_pack', translate(hass, 'sprachpaketGesendet', { id: data.lang_id }));
                        dialog.close();
                    }
                });
            } });
            go.setAttribute('data-action', 'confirm');
            if (busy) go.setAttribute('aria-busy', 'true');
            actions.append(cancel, go);
            body.appendChild(actions);
        }
    };
}

// ---------------------------------------------------------------------------
// Cleaning settings (clean-settings): global rows, CleanGenius, Customized
// Cleaning per room, mop type, cleaning sequence (SET-01…06) — rows and the
// write path are device-settings' (R08)
// ---------------------------------------------------------------------------

/** Room keys of the integration (SEGMENT_SELECTS/NUMBERS) and the module that writes them. */
const ROOM_KEYS = {
    'clean-settings': ['suction_level', 'water_volume', 'mop_pad_humidity', 'cleaning_mode', 'cleaning_times', 'custom_mopping_route',
        'cleaning_route', 'mop_pressure', 'mop_temperature', 'mop_type', 'order', 'wetness_level'],
    'map-editor': ['name', 'visibility', 'floor_material', 'floor_material_direction']
};

/** Basics in the reference's order; repeats follow as the card's own row. */
const CLEAN_BASIC = ['cleaning_mode', 'suction_level', 'mop_pad_humidity', 'wetness_level', 'water_volume', 'cleaning_route', 'mop_pressure'];

/**
 * Repeats 1–3 (range of Customized Cleaning, device.py#L7244): no device key,
 * the card keeps it (`_repeats`, never stored, R21). One row for the task
 * panel and the settings (R08).
 */
function repeatsRow(card, { hint = false } = {}) {
    const hass = card._hass;
    const row = document.createElement('div');
    row.className = 'task-tools task-repeats';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', translate(hass, 'wiederholungen'));
    const value = document.createElement('span');
    value.className = 'task-count';
    value.setAttribute('role', 'status');
    value.setAttribute('data-note', 'repeats');
    value.textContent = translate(hass, 'wiederholungenWert', { n: card._repeats });
    const step = (d) => {
        card._repeats = Math.min(3, Math.max(1, card._repeats + d));
        card._update();
        rerender(card);
    };
    const minus = BuschUI.action({ label: translate(hass, 'wenigerWiederholungen'), icon: 'mdi:minus', variant: 'secondary', disabled: card._repeats <= 1, onClick: () => step(-1) });
    minus.setAttribute('data-action', 'repeats-minus');
    const plus = BuschUI.action({ label: translate(hass, 'mehrWiederholungen'), icon: 'mdi:plus', variant: 'secondary', disabled: card._repeats >= 3, onClick: () => step(1) });
    plus.setAttribute('data-action', 'repeats-plus');
    row.append(value, minus, plus);
    if (hint) {
        const text = document.createElement('span');
        text.className = 'repeats-hint';
        text.textContent = translate(hass, 'wiederholungenHinweis');
        row.appendChild(text);
    }
    return row;
}

/** A titled section of a view; without content it does not appear (R18). */
function viewSection(hass, name, nodes) {
    if (!nodes.length) return null;
    const section = document.createElement('section');
    section.setAttribute('data-section', name);
    const heading = document.createElement('h2');
    heading.className = 'settings-heading';
    heading.textContent = translate(hass, 'abschnitt_' + name);
    const list = document.createElement('div');
    list.className = 'settings-list';
    list.append(...nodes);
    section.append(heading, list);
    return section;
}

/** SET-01: the cleaning settings; rows save at once like in device-settings. */
function cleanSettingsView(card) {
    loadSettingTexts(card);
    return {
        title: translate(card._hass, 'reinigungseinstellungen'),
        kind: 'editor',
        watch: () => settingsWatch(card),
        render: (body, hass, dialog) => {
            const model = card._model();
            const rows = (keys) => keys.map((key) => settingRow(card, model, key)).filter(Boolean);
            const sections = [
                ['cleangenius', model.can('cleangenius') ? rows(['cleangenius', 'cleangenius_mode']) : []],
                ['basic', rows(CLEAN_BASIC).concat(repeatsRow(card, { hint: true }))],
                // SET-04: CleanGenius picks per room itself; the section says so instead of the switch.
                ['customized', !model.can('customized_cleaning') ? []
                    : model.attr('cleangenius_cleaning') === true ? [noteLine(translate(hass, 'cleanGeniusRaeume'))]
                        : rows(['customized_cleaning']).concat(roomsInOrder(model).length
                            ? [viewLink(translate(hass, 'raeumeEinstellen'), 'rooms', 'mdi:floor-plan', () => dialog.show(roomsView(card)))] : [])],
                ['sequence', model.can('customized_cleaning') && roomsInOrder(model).length
                    ? [viewLink(translate(hass, 'entrySequence'), 'sequence', 'mdi:sort-numeric-ascending', () => dialog.show(sequenceView(card)))] : []],
                ['more', groupShown(model, 'cleaning')
                    ? [viewLink(translate(hass, 'weitereReinigung'), 'more-cleaning', 'mdi:robot-vacuum', () => dialog.show(groupView(card, 'cleaning')))] : []]
            ];
            for (const [name, nodes] of sections) {
                const section = viewSection(hass, name, nodes);
                if (section) body.appendChild(section);
            }
        }
    };
}

/**
 * Room values are codes (enums of types.py v2.0.3, #L485/495/515/717/728/864/872);
 * code → name for the integration's select texts. mop_pressure/mop_temperature
 * arrive as names (types.py#L3981) and go back as codes.
 */
const CODE_TABLES = {
    suction_level: { 0: 'Quiet', 1: 'Standard', 2: 'Strong', 3: 'Turbo' },
    water_volume: { 1: 'Low', 2: 'Medium', 3: 'High' },
    mop_pad_humidity: { 1: 'Slightly dry', 2: 'Moist', 3: 'Wet' },
    cleaning_mode: { 0: 'Sweeping', 1: 'Mopping', 2: 'Sweeping and mopping' },
    cleaning_times: { 1: '1×', 2: '2×', 3: '3×' },
    cleaning_route: { 1: 'Standard', 2: 'Intensive', 3: 'Deep', 4: 'Quick' },
    custom_mopping_route: { '-1': 'Off', 0: 'Standard', 1: 'Intensive', 2: 'Deep' },
    mop_pressure: { 0: 'Light', 2: 'Normal' },
    mop_temperature: { 0: 'Normal', 1: 'Warm' }
};

/** The fields set_custom_cleaning takes on this device (device.py#L7234–L7294); others it refuses. */
function roomFields(model) {
    const fields = ['suction_level', model.can('wetness_level') ? 'wetness_level' : 'water_volume', 'cleaning_times'];
    if (model.can('custom_cleaning_mode')) fields.push('cleaning_mode');
    if (model.can('cleaning_route')) fields.push('cleaning_route');
    else if (model.can('segment_mopping_settings')) fields.push('custom_mopping_route');
    if (model.can('mop_pressure')) fields.push('mop_pressure');
    if (model.can('mop_temperature')) fields.push('mop_temperature');
    return fields;
}

/** A room field's display table: with a wash station the water is "mop pad humidity" (select.py#L563). */
const roomTable = (model, key) => CODE_TABLES[key === 'water_volume' && model.can('self_wash_base') ? 'mop_pad_humidity' : key];

/** Code of a room value (number, numeric text or the enum's name), else undefined. */
function roomCode(key, value) {
    if (value === undefined || value === null || value === '') return undefined;
    if (Number.isFinite(Number(value))) return Number(value);
    const hit = Object.entries(CODE_TABLES[key] || {}).find(([, name]) => enumName(name) === enumName(value));
    return hit ? Number(hit[0]) : undefined;
}

/** The ranges set_custom_cleaning checks (device.py#L7234–L7300). */
function roomValid(model, key, code) {
    if (!Number.isInteger(code)) return false;
    if (key === 'wetness_level') return code >= 1 && code <= 32;
    if (key === 'cleaning_route' && model.can('segment_slow_clean_route') && code > 3) return false;
    return Object.keys(CODE_TABLES[key]).map(Number).includes(code);
}

/**
 * Data for `vacuum_set_custom_cleaning` of one room: the change over all its
 * current values (else they would fall back), as codes, only fields with
 * capability. null when a value is unknown or out of range (never guessed).
 */
function roomPayload(model, room, change = {}) {
    const id = Number(room && (room.room_id !== undefined ? room.room_id : room.id));
    if (!Number.isInteger(id)) return null;
    const data = { segment_id: [id] };
    for (const key of roomFields(model)) {
        const code = roomCode(key, key in change ? change[key] : room[key]);
        if (!roomValid(model, key, code)) return null;
        data[key === 'cleaning_times' ? 'repeats' : key] = [code];
    }
    return data;
}

/** Rooms of the active map camera (R20: only there), hidden ones never. */
function roomsOf(model) {
    const rooms = cameraAttrs(model).rooms || {};
    return Object.fromEntries(Object.entries(rooms).filter(([, r]) => r && r.visibility !== 'Hidden'));
}

/** Room ids in cleaning order, then the rest. */
function roomsInOrder(model) {
    const rooms = roomsOf(model);
    const sequence = (model.attr('cleaning_sequence') || []).map(String).filter((id) => rooms[id]);
    return sequence.concat(Object.keys(rooms).filter((id) => !sequence.includes(id)));
}

const roomName = (room, id) => (room && (room.custom_name || room.name)) || String(id);

/** Why room values cannot change now (device.py#L7228–L7232, L7304), or ''. */
function roomLock(model) {
    if (taskActive(model, model.state ? model.state.state : 'unavailable')) return 'sperre_idle';
    if (model.attr('has_temporary_map') === true || model.attr('has_saved_map') === false) return 'sperre_savedMap';
    return '';
}

/** A room value as text: the integration's option text, wetness as number, passes as n×. */
function roomValueText(hass, model, key, code) {
    if (code === undefined) return translate(hass, 'wertUnbekannt');
    if (key === 'wetness_level') return String(code);
    const name = (roomTable(model, key) || {})[code];
    if (name === undefined) return String(code);
    return key === 'cleaning_times' ? name : optionLabel(hass, key === 'water_volume' && model.can('self_wash_base') ? 'mop_pad_humidity' : key, name);
}

/** The room's values as one short line: "Turbo · 16 · 2×". */
const roomShort = (hass, model, room) => ['suction_level', model.can('wetness_level') ? 'wetness_level' : 'water_volume', 'cleaning_times']
    .map((key) => roomValueText(hass, model, key, roomCode(key, room[key]))).join(' · ');

/** One room write until the camera shows it (R17), else back with a note (pattern writeSetting). */
function writeRoom(card, id, change) {
    const model = card._model();
    const data = roomPayload(model, roomsOf(model)[id], change);
    if (!data) {
        card._settingNotes.set('room:' + id, translate(card._hass, 'raumUnvollstaendig'));
        rerender(card);
        return false;
    }
    return trackWrite(card, 'room:' + id, {
        want: change,
        label: roomName(roomsOf(model)[id], id),
        check: (m) => Object.keys(change).every((key) => roomCode(key, (roomsOf(m)[id] || {})[key]) === roomCode(key, change[key])),
        call: () => card._hass.callService('dreame_vacuum', 'vacuum_set_custom_cleaning', Object.assign({ entity_id: card._opts.entity }, data))
    });
}

/** Mop type of one room: never with map_id — a foreign one switches the map (device.py#L7681). */
function writeMopType(card, id, type) {
    return trackWrite(card, 'mop:' + id, {
        want: type,
        label: roomName(roomsOf(card._model())[id], id),
        check: (m) => String((roomsOf(m)[id] || {}).mop_type || '').toUpperCase() === type,
        call: () => card._hass.callService('dreame_vacuum', 'vacuum_set_mop_type', { entity_id: card._opts.entity, mop_type: { [id]: type } })
    });
}

/** A settings-style row for a room field: select of codes or number (same look as settingRow). */
function roomFieldRow(hass, { key, label, value, options, number, state, words, disabled, onChange }) {
    const row = document.createElement('div');
    row.className = 'setting';
    row.setAttribute('data-setting', 'room-' + key);
    row.setAttribute('data-state', state);
    const text = document.createElement('div');
    text.className = 'setting-text';
    const name = document.createElement('span');
    name.className = 'setting-name';
    name.id = 'room-' + key;
    name.textContent = label;
    const status = document.createElement('span');
    status.className = 'setting-status';
    status.id = 'room-status-' + key;
    status.textContent = words;
    text.append(name, status);
    const control = document.createElement(number ? 'input' : 'select');
    control.className = number ? 'setting-input' : 'setting-select';
    control.setAttribute('aria-labelledby', name.id);
    control.setAttribute('aria-describedby', status.id);
    if (disabled) control.disabled = true;
    if (number) {
        control.setAttribute('type', 'number');
        control.setAttribute('inputmode', 'numeric');
        control.setAttribute('min', String(number.min));
        control.setAttribute('max', String(number.max));
        control.value = value === undefined ? '' : String(value);
    } else {
        if (!options.some(([v]) => v === value)) {
            const unknown = document.createElement('option');
            unknown.value = '';
            unknown.disabled = true;
            unknown.textContent = translate(hass, 'wertUnbekannt');
            control.appendChild(unknown);
        }
        for (const [v, t] of options) {
            const option = document.createElement('option');
            option.value = String(v);
            option.textContent = t;
            control.appendChild(option);
        }
        control.value = value === undefined ? '' : String(value);
    }
    control.addEventListener('change', () => { if (control.value !== '') onChange(control.value); });
    row.append(text, control);
    return row;
}

/** Room list (SET-04): rooms in cleaning order with their short values; a tap opens the room. */
function roomsView(card) {
    return {
        title: translate(card._hass, 'raeumeEinstellen'),
        kind: 'editor',
        watch: () => settingsWatch(card),
        render: (body, hass, dialog) => {
            const model = card._model();
            const rooms = roomsOf(model);
            const ids = roomsInOrder(model);
            if (!ids.length) {
                body.appendChild(noteLine(translate(hass, 'keineRaeume')));
                return;
            }
            const list = document.createElement('div');
            list.className = 'menu room-list';
            for (const id of ids) {
                const text = roomName(rooms[id], id) + ' · ' + roomShort(hass, model, rooms[id]);
                const item = BuschUI.action({ label: text, text, icon: rooms[id].icon || 'mdi:floor-plan', variant: 'quiet', onClick: () => dialog.show(roomView(card, id)) });
                item.classList.add('menu-item');
                item.setAttribute('data-room', id);
                list.appendChild(item);
            }
            body.appendChild(list);
        }
    };
}

/** One room's values, each field with capability (third level, R25). */
function roomView(card, id) {
    const model0 = card._model();
    let field = null; // the field of the last change: its row shows the outcome (R17)
    return {
        title: roomName(roomsOf(model0)[id], id),
        kind: 'editor',
        watch: () => settingsWatch(card),
        render: (body, hass, dialog) => {
            const model = card._model();
            const room = roomsOf(model)[id];
            if (!room) {
                body.appendChild(noteLine(translate(hass, 'keineRaeume')));
                return;
            }
            const track = 'room:' + id;
            const pending = card._settingWrites.get(track);
            if (pending && pending.check(model)) settleWrite(card, track);
            const busy = card._settingWrites.get(track);
            const lock = roomLock(model);
            if (lock) body.appendChild(noteLine(translate(hass, lock)));
            const note = card._settingNotes.get(track);
            const list = document.createElement('div');
            list.className = 'settings-list';
            for (const key of roomFields(model)) {
                const shown = busy && key in busy.want ? busy.want[key] : room[key];
                const code = roomCode(key, shown);
                const state = busy && key in busy.want ? 'busy' : note && field === key ? 'error' : lock ? 'locked' : code === undefined ? 'unknown' : 'ok';
                const words = state === 'busy' ? translate(hass, 'speichert') : state === 'error' ? note : state === 'unknown' ? translate(hass, 'wertUnbekannt') : '';
                const table = roomTable(model, key) || {};
                const options = Object.keys(table).map(Number).filter((c) => roomValid(model, key, c)).map((c) => [String(c), roomValueText(hass, model, key, c)]);
                const label = key === 'cleaning_times' ? translate(hass, 'durchgaenge')
                    : entityLabel(hass, key === 'wetness_level' ? 'number' : 'select', key === 'water_volume' && model.can('self_wash_base') ? 'mop_pad_humidity' : key);
                list.appendChild(roomFieldRow(hass, {
                    key, label, state, words, options,
                    value: code === undefined ? undefined : String(code),
                    number: key === 'wetness_level' ? { min: 1, max: 32 } : null,
                    disabled: !!lock || !!busy,
                    onChange: (value) => {
                        const n = Number(value);
                        field = key;
                        if (!roomValid(model, key, n)) {
                            card._settingNotes.set(track, translate(hass, 'bereich', { min: 1, max: 32 }));
                            return rerender(card);
                        }
                        return writeRoom(card, id, { [key]: n });
                    }
                }));
            }
            // SET-06: mop type A/B/C, its own service (device.py#L7655).
            if (model.can('auto_change_mop')) {
                const mopTrack = 'mop:' + id;
                const mopPending = card._settingWrites.get(mopTrack);
                if (mopPending && mopPending.check(model)) settleWrite(card, mopTrack);
                const mopBusy = card._settingWrites.get(mopTrack);
                const mopNote = card._settingNotes.get(mopTrack);
                const value = mopBusy ? mopBusy.want : room.mop_type ? String(room.mop_type).toUpperCase() : undefined;
                list.appendChild(roomFieldRow(hass, {
                    key: 'mop_type', label: entityLabel(hass, 'select', 'mop_type'), value,
                    options: ['A', 'B', 'C'].map((t) => [t, optionLabel(hass, 'mop_type', t)]),
                    state: mopBusy ? 'busy' : mopNote ? 'error' : lock ? 'locked' : value === undefined ? 'unknown' : 'ok',
                    words: mopBusy ? translate(hass, 'speichert') : mopNote || (value === undefined ? translate(hass, 'wertUnbekannt') : ''),
                    disabled: !!lock || !!mopBusy,
                    onChange: (type) => writeMopType(card, id, type)
                }));
            }
            body.appendChild(list);
            if (note && !field) body.appendChild(noteLine(note, 'error'));
            const actions = document.createElement('div');
            actions.className = 'actions';
            const all = BuschUI.action({ label: translate(hass, 'aufAlleTitel'), text: translate(hass, 'aufAlleTitel'), icon: 'mdi:content-copy', disabled: !!lock || !!busy,
                onClick: () => dialog.show(applyAllView(card, id)) });
            all.setAttribute('data-action', 'apply-all');
            actions.appendChild(all);
            body.appendChild(actions);
        }
    };
}

/**
 * „Auf alle Räume übertragen“ (R02/R13): asks with the rooms it overwrites,
 * then one call per room, one after the other, progress visible (R11), stops
 * at the first error and names what changed (R12).
 */
function applyAllView(card, sourceId) {
    let run = null;
    return {
        title: translate(card._hass, 'aufAlleTitel') + '?',
        kind: 'confirm',
        watch: () => [],
        render: (body, hass, dialog) => {
            const model = card._model();
            const rooms = roomsOf(model);
            const targets = roomsInOrder(model).filter((id) => id !== String(sourceId));
            const names = (ids) => ids.map((id) => roomName(rooms[id], id)).join(', ') || '–';
            if (!run) body.appendChild(noteLine(translate(hass, 'aufAlleFrage', { raum: roomName(rooms[sourceId], sourceId), raeume: names(targets) })));
            else {
                body.appendChild(noteLine(translate(hass, 'aufAlleStand', { n: run.done.length, gesamt: run.total })));
                if (run.error) body.appendChild(noteLine(translate(hass, 'aufAlleFehler', { grund: run.error, raeume: names(run.done) }), 'error'));
            }
            const actions = document.createElement('div');
            actions.className = 'actions';
            const close = BuschUI.action({ label: translate(hass, run ? 'zurueck' : 'abbrechen'), text: translate(hass, run ? 'zurueck' : 'abbrechen'), disabled: !!run && !run.finished, onClick: () => dialog._goBack() });
            close.setAttribute('data-action', 'cancel');
            actions.appendChild(close);
            if (!run) {
                const go = BuschUI.action({ label: translate(hass, 'uebertragen'), text: translate(hass, 'uebertragen'), variant: 'primary', onClick: async () => {
                    const values = Object.fromEntries(roomFields(model).map((key) => [key, rooms[sourceId][key]]));
                    run = { done: [], total: targets.length, error: '', finished: false };
                    for (const id of targets) {
                        const data = roomPayload(model, rooms[id], values);
                        if (!data) { run.error = translate(hass, 'raumUnvollstaendig'); break; }
                        dialog._render();
                        try {
                            await card._hass.callService('dreame_vacuum', 'vacuum_set_custom_cleaning', Object.assign({ entity_id: card._opts.entity }, data));
                            run.done.push(id);
                        } catch (error) {
                            run.error = errorText(error);
                            break;
                        }
                    }
                    run.finished = true;
                    if (dialog.isConnected) dialog._render();
                } });
                go.setAttribute('data-action', 'confirm');
                actions.appendChild(go);
            }
            body.appendChild(actions);
        }
    };
}

/**
 * The cleaning sequence (SET-05): strict devices (cleaning_sequence_v2) give
 * every room a place and refuse an empty list; others leave rooms without a
 * place, and an empty list turns the own sequence off (device.py#L7147–L7174,
 * map.py#L2772–L2797). Ids are the camera's; unknown ones never appear.
 */
function sequenceModel(model, rooms) {
    const ids = Object.keys(rooms);
    const strict = model.can('cleaning_sequence_v2');
    const attr = model.attr('cleaning_sequence');
    const ordered = Array.isArray(attr) ? attr.map(String).filter((id) => rooms[id])
        : ids.filter((id) => Number(rooms[id].order) > 0).sort((a, b) => Number(rooms[a].order) - Number(rooms[b].order));
    const rest = ids.filter((id) => !ordered.includes(id));
    return strict ? { strict, ordered: ordered.concat(rest), unordered: [] } : { strict, ordered, unordered: rest };
}

/** The one move all ways share (drag, buttons, keys, tap mode; R08/R15): `id` to place `to`. */
function moveRoom(list, id, to) {
    const next = list.filter((x) => x !== id);
    next.splice(Math.max(0, Math.min(to, next.length)), 0, id);
    return next;
}

const TOUCH_HOLD_MS = 300;

/**
 * The sequence editor (SET-05, CORE-05 entry; one view for menu and settings,
 * R01/R08). The draft lives on the card until the device reports it (R04/R10)
 * and is sent once with "Save".
 */
function sequenceView(card) {
    let grab = null; // keyboard: { id, before }
    let tapping = null; // tap mode: ids in tapped order
    let undo = null; // „Reihenfolge aus“: the draft before
    let spoken = '';
    return {
        title: translate(card._hass, 'entrySequence'),
        kind: 'editor',
        watch: () => settingsWatch(card),
        render: (body, hass, dialog) => {
            const model = card._model();
            const rooms = roomsOf(model);
            const base = sequenceModel(model, rooms);
            const pending = card._settingWrites.get('sequence');
            if (pending && pending.check(model)) settleWrite(card, 'sequence');
            const busy = card._settingWrites.has('sequence');
            let draft = card._drafts.get('sequence');
            if (draft && JSON.stringify(draft.ordered) === JSON.stringify(base.ordered) && !undo) {
                card._drafts.delete('sequence');
                draft = null;
            }
            const current = draft || base;
            const dirty = !!draft;
            const lock = roomLock(model);
            const name = (id) => roomName(rooms[id], id);
            const redraw = (focusId) => {
                dialog._render();
                const node = focusId && Array.from(dialog.shadowRoot.querySelectorAll('[role="option"]')).find((n) => n.getAttribute('data-room') === focusId);
                if (node) node.focus();
            };
            const change = (ordered, unordered = current.unordered, focusId) => {
                card._drafts.set('sequence', { strict: current.strict, ordered: ordered.filter((id) => rooms[id]), unordered });
                redraw(focusId);
            };
            const say = (key, id, to) => { spoken = translate(hass, key, { name: name(id), n: to + 1, gesamt: current.ordered.length }); };

            if (lock) body.appendChild(noteLine(translate(hass, lock)));
            if (dirty) body.appendChild(noteLine(translate(hass, 'ungespeichert'), 'dirty'));
            const note = card._settingNotes.get('sequence');
            if (note) body.appendChild(noteLine(note, 'error'));
            if (undo) {
                const line = noteLine(translate(hass, 'reihenfolgeAusFolge', { raeume: undo.ordered.map(name).join(', ') }));
                const back = BuschUI.action({ label: translate(hass, 'rueckgaengig'), text: translate(hass, 'rueckgaengig'), icon: 'mdi:undo', onClick: () => {
                    card._drafts.set('sequence', undo);
                    undo = null;
                    redraw();
                } });
                back.setAttribute('data-action', 'undo');
                line.appendChild(back);
                body.appendChild(line);
            }

            if (tapping) {
                body.appendChild(noteLine(translate(hass, 'antippenHinweis')));
                const chips = document.createElement('div');
                chips.className = 'seq-chips';
                for (const id of current.ordered.concat(current.unordered)) {
                    const n = tapping.indexOf(id) + 1;
                    const chip = BuschUI.action({ label: n ? translate(hass, 'raumPosition', { name: name(id), n }) : name(id), text: n ? n + ' · ' + name(id) : name(id),
                        icon: rooms[id].icon || 'mdi:floor-plan', onClick: () => {
                            tapping = n ? tapping.filter((x) => x !== id) : tapping.concat(id);
                            redraw();
                        } });
                    chip.setAttribute('data-tap', id);
                    chip.setAttribute('aria-pressed', String(!!n));
                    chips.appendChild(chip);
                }
                const actions = document.createElement('div');
                actions.className = 'actions';
                const cancel = BuschUI.action({ label: translate(hass, 'abbrechen'), text: translate(hass, 'abbrechen'), onClick: () => { tapping = null; redraw(); } });
                cancel.setAttribute('data-action', 'tap-cancel');
                const done = BuschUI.action({ label: translate(hass, 'fertig'), text: translate(hass, 'fertig'), variant: 'primary', onClick: () => {
                    const ordered = tapping.concat(current.ordered.filter((x) => !tapping.includes(x)));
                    const unordered = current.unordered.filter((x) => !tapping.includes(x));
                    tapping = null;
                    change(ordered, unordered);
                } });
                done.setAttribute('data-action', 'tap-done');
                actions.append(cancel, done);
                body.append(chips, actions);
                return;
            }

            const live = document.createElement('p');
            live.className = 'seq-live';
            live.setAttribute('aria-live', 'polite');
            live.setAttribute('role', 'status');
            live.textContent = spoken;
            const list = document.createElement('div');
            list.className = 'seq-list';
            list.setAttribute('role', 'listbox');
            list.setAttribute('aria-label', translate(hass, 'entrySequence'));
            const total = current.ordered.length;
            current.ordered.forEach((id, index) => {
                const row = document.createElement('div');
                row.className = 'seq-row';
                row.setAttribute('role', 'option');
                row.setAttribute('data-room', id);
                row.setAttribute('aria-selected', String(!!grab && grab.id === id));
                row.setAttribute('aria-label', translate(hass, 'raumPlatz', { name: name(id), n: index + 1, gesamt: total }));
                row.tabIndex = 0;
                const handle = document.createElement('span');
                handle.className = 'seq-handle';
                handle.setAttribute('aria-hidden', 'true');
                const grip = document.createElement('ha-icon');
                grip.setAttribute('icon', 'mdi:drag');
                handle.appendChild(grip);
                const position = document.createElement('span');
                position.className = 'seq-pos';
                position.textContent = String(index + 1);
                const label = document.createElement('span');
                label.className = 'seq-name';
                label.textContent = name(id);
                row.append(handle, position, label);
                const button = (action, icon, key, to, disabled) => {
                    const b = BuschUI.action({ label: translate(hass, key, { name: name(id) }), icon, variant: 'icon-only', disabled: disabled || !!lock,
                        onClick: () => { say('raumVerschoben', id, to); change(moveRoom(current.ordered, id, to)); } });
                    b.setAttribute('data-action', action);
                    b.tabIndex = -1; // keys work on the row itself (R03)
                    return b;
                };
                row.append(button('up', 'mdi:arrow-up', 'nachOben', index - 1, index === 0), button('down', 'mdi:arrow-down', 'nachUnten', index + 1, index === total - 1),
                    button('top', 'mdi:arrow-collapse-up', 'anDenAnfang', 0, index === 0));
                if (!current.strict) {
                    const out = BuschUI.action({ label: translate(hass, 'herausnehmen', { name: name(id) }), icon: 'mdi:close', variant: 'icon-only', disabled: !!lock,
                        onClick: () => change(current.ordered.filter((x) => x !== id), current.unordered.concat(id)) });
                    out.setAttribute('data-action', 'remove');
                    out.tabIndex = -1;
                    row.appendChild(out);
                }
                // Keys (R03/R16): Space grabs and drops, arrows move, Escape cancels.
                row.addEventListener('keydown', (event) => {
                    if (lock) return;
                    const step = { ArrowUp: -1, ArrowDown: 1 }[event.key];
                    if (event.key === ' ') {
                        event.preventDefault();
                        if (grab) { say('raumAbgelegt', id, index); grab = null; } else { grab = { id, before: current.ordered.slice() }; say('raumGegriffen', id, index); }
                        redraw(id);
                    } else if (step && grab) {
                        event.preventDefault();
                        say('raumVerschoben', id, index + step);
                        change(moveRoom(current.ordered, id, index + step), current.unordered, id);
                    } else if (step) {
                        event.preventDefault();
                        const next = current.ordered[index + step];
                        const node = next && Array.from(dialog.shadowRoot.querySelectorAll('[role="option"]')).find((n) => n.getAttribute('data-room') === next);
                        if (node) node.focus();
                    } else if (event.key === 'Escape' && grab) {
                        event.preventDefault();
                        event.stopPropagation(); // one level back is the cancelled grab, not the view (R03)
                        const before = grab.before;
                        grab = null;
                        say('raumAbgebrochen', id, before.indexOf(id));
                        change(before, current.unordered, id);
                    }
                });
                // Pointer: mouse/pen at once, touch after holding 300 ms (R06); the drop is moveRoom.
                handle.addEventListener('pointerdown', (event) => {
                    if (lock || (event.pointerType === 'mouse' && event.button !== 0)) return;
                    let active = event.pointerType !== 'touch';
                    let to = index;
                    const timer = active ? null : setTimeout(() => { active = true; row.setAttribute('data-dragging', ''); }, TOUCH_HOLD_MS);
                    if (active) row.setAttribute('data-dragging', '');
                    try { handle.setPointerCapture(event.pointerId); } catch (e) { /* attrappe or lost pointer: events still reach the handle */ }
                    const others = () => Array.from(dialog.shadowRoot.querySelectorAll('[role="option"]')).filter((n) => n !== row);
                    const move = (e) => {
                        if (!active) { clearTimeout(timer); return end(); }
                        e.preventDefault && e.preventDefault();
                        to = others().filter((n) => { const r = n.getBoundingClientRect(); return r.top + r.height / 2 < e.clientY; }).length;
                    };
                    const up = () => {
                        const moved = active && to !== index;
                        end();
                        if (moved) { say('raumVerschoben', id, to); change(moveRoom(current.ordered, id, to)); } else row.removeAttribute('data-dragging');
                    };
                    const end = () => {
                        clearTimeout(timer);
                        handle.removeEventListener('pointermove', move);
                        handle.removeEventListener('pointerup', up);
                        handle.removeEventListener('pointercancel', end);
                        row.removeAttribute('data-dragging');
                    };
                    handle.addEventListener('pointermove', move);
                    handle.addEventListener('pointerup', up);
                    handle.addEventListener('pointercancel', end);
                });
                list.appendChild(row);
            });
            if (total) body.append(list, live);
            else body.appendChild(noteLine(translate(hass, 'reihenfolgeLeer')));

            if (!current.strict && current.unordered.length) {
                const rows = current.unordered.map((id) => {
                    const row = document.createElement('div');
                    row.className = 'setting';
                    const text = document.createElement('span');
                    text.className = 'setting-name';
                    text.textContent = name(id);
                    const add = BuschUI.action({ label: translate(hass, 'einreihen', { name: name(id) }), text: translate(hass, 'einreihenKurz'), icon: 'mdi:plus', disabled: !!lock,
                        onClick: () => change(current.ordered.concat(id), current.unordered.filter((x) => x !== id)) });
                    add.setAttribute('data-action', 'add');
                    add.setAttribute('data-room', id);
                    row.append(text, add);
                    return row;
                });
                body.appendChild(viewSection(hass, 'unordered', rows));
            }

            const actions = document.createElement('div');
            actions.className = 'actions';
            const tap = BuschUI.action({ label: translate(hass, 'antippen'), text: translate(hass, 'antippen'), icon: 'mdi:gesture-tap', disabled: !!lock, onClick: () => { tapping = []; redraw(); } });
            tap.setAttribute('data-action', 'tap-mode');
            actions.appendChild(tap);
            if (!current.strict && current.ordered.length) {
                const off = BuschUI.action({ label: translate(hass, 'reihenfolgeAus'), text: translate(hass, 'reihenfolgeAus'), disabled: !!lock, onClick: () => {
                    undo = { strict: current.strict, ordered: current.ordered.slice(), unordered: current.unordered.slice() };
                    change([], current.unordered.concat(current.ordered));
                } });
                off.setAttribute('data-action', 'sequence-off');
                actions.appendChild(off);
            }
            if (dirty) {
                const discard = BuschUI.action({ label: translate(hass, 'verwerfen'), text: translate(hass, 'verwerfen'), onClick: () => { card._drafts.delete('sequence'); undo = null; redraw(); } });
                discard.setAttribute('data-action', 'discard');
                actions.appendChild(discard);
            }
            const save = BuschUI.action({ label: translate(hass, busy ? 'speichert' : 'speichern'), text: translate(hass, busy ? 'speichert' : 'speichern'), variant: 'primary',
                disabled: !!lock || busy || !dirty, onClick: () => {
                    const ids = current.ordered.filter((id) => rooms[id]).map(Number);
                    const same = (m) => JSON.stringify((m.attr('cleaning_sequence') || []).map(Number)) === JSON.stringify(ids);
                    undo = null;
                    trackWrite(card, 'sequence', { want: ids, label: translate(hass, 'entrySequence'), check: same,
                        call: () => card._hass.callService('dreame_vacuum', 'vacuum_set_cleaning_sequence', { entity_id: card._opts.entity, cleaning_sequence: ids }) });
                } });
            save.setAttribute('data-action', 'save');
            if (busy) save.setAttribute('aria-busy', 'true');
            actions.appendChild(save);
            body.appendChild(actions);
        }
    };
}

// ---------------------------------------------------------------------------
// Station (dock): actions, dock menu, station view with tabs (DOCK-01…06)
// ---------------------------------------------------------------------------

/**
 * Station actions, all through `vacuum_call_action { key[, value] }`
 * (device.py#L5407–L5630). `needs`: can() name; `when`: possible right now
 * (R18); `tab`: shown in that tab of the station view and, with `menu`, in the
 * dock menu (R01: same text, symbol, call); no tab = "Maintenance".
 * `confirm`: asks first, naming what follows (R13).
 */
const STATION_ACTIONS = [
    { name: 'wash', key: 'toggle_washing', needs: 'wash', tab: 'wash', menu: true, icon: 'mdi:dishwasher',
        when: (m) => m.attr('washing_available') !== false || m.attr('washing') === true,
        text: (m) => (m.attr('washing_paused') ? 'aktWaschenFortsetzen' : m.attr('washing') ? 'aktWaschenPausieren' : 'aktWaschen') },
    { name: 'dry', key: 'toggle_drying', needs: 'dry', tab: 'dry', menu: true, icon: 'mdi:weather-sunny',
        when: (m) => m.attr('drying_available') !== false || m.attr('drying') === true,
        text: (m) => (m.attr('drying') ? 'aktTrocknenStoppen' : 'aktTrocknen') },
    { name: 'dust_bag_dry', key: 'toggle_dust_bag_drying', needs: 'dust_bag_dry', tab: 'dry', menu: true, icon: 'mdi:fire',
        when: (m) => m.attr('dust_bag_drying_available') !== false, text: () => 'aktBeutel' },
    { name: 'empty', key: 'start_auto_empty', needs: 'empty', tab: 'empty', menu: true, icon: 'mdi:delete-empty',
        when: (m) => m.attr('dust_collection_available') !== false, text: () => 'aktEntleeren' },
    // start_draining without value drains, with '1' empties the clean water tank (device.py#L5567): nothing else.
    { name: 'drain', key: 'start_draining', needs: 'drain', icon: 'mdi:pump', confirm: true,
        when: (m) => m.attr('draining_available') !== false, text: () => 'aktAblassen' },
    { name: 'empty_tank', key: 'start_draining', value: '1', needs: 'empty_tank', icon: 'mdi:waves-arrow-up', confirm: true,
        when: (m) => m.attr('draining_available') !== false, text: () => 'aktTankLeeren' },
    // Live 10.11.2026: the X40 leaves the dock for this and does not come back by itself.
    { name: 'station_cleaning', key: 'start_station_cleaning', needs: 'station_cleaning', icon: 'mdi:car-wash', confirm: true, when: () => true, text: () => 'aktStationReinigen' },
    { name: 'self_repair', key: 'start_self_repairing', needs: 'self_repair', icon: 'mdi:wrench-cog', confirm: true, when: () => true, text: () => 'aktSelbstreparatur' },
    // Starts a cleaning of the missed areas (device.py#L5630): the robot drives off.
    { name: 'recleaning', key: 'start_recleaning', needs: 'recleaning', icon: 'mdi:refresh-circle', confirm: true, when: () => true, text: () => 'aktNachreinigen' }
];

const stationActions = (model, filter) => STATION_ACTIONS.filter((a) => filter(a) && model.can(a.needs) && a.when(model));

/** Runs an action once (R11: busy until the service answers, a second tap is ignored). */
function runStationAction(card, action, done) {
    const hass = card._hass;
    return callAction(card, action.key, action.value, { track: 'station:' + action.name, label: translate(hass, action.text(card._model())), failKey: 'aktionFehler', done });
}

/** The one button of a station action, for menu and station view (R01/R08), with its error note (R12). */
function stationActionItem(card, model, hass, action, done) {
    const track = 'station:' + action.name;
    const busy = card._settingWrites.has(track);
    const label = translate(hass, action.text(model));
    const shown = busy ? translate(hass, 'wirdGestartet') : label;
    const button = BuschUI.action({ label: busy ? label + ' · ' + shown : label, text: shown, icon: action.icon, variant: 'quiet', disabled: busy,
        onClick: () => (action.confirm ? stationConfirm(card, action) : runStationAction(card, action, done)) });
    button.classList.add('menu-item');
    button.setAttribute('data-station-action', action.name);
    if (busy) button.setAttribute('aria-busy', 'true');
    const note = card._settingNotes.get(track);
    if (!note) return [button];
    const line = noteLine(note, 'error');
    line.setAttribute('data-note', action.name);
    return [button, line];
}

/** Every maintenance action asks first and says what follows (R13), incl. leaving the dock. */
function stationConfirm(card, action) {
    const hass = card._hass;
    const view = {
        title: translate(hass, action.text(card._model())) + '?',
        kind: 'confirm',
        render: (body, h, dialog) => {
            body.appendChild(noteLine(translate(h, 'folge_' + action.name)));
            const actions = document.createElement('div');
            actions.className = 'actions';
            const cancel = BuschUI.action({ label: translate(h, 'abbrechen'), text: translate(h, 'abbrechen'), onClick: () => dialog._goBack() });
            cancel.setAttribute('data-action', 'cancel');
            const go = BuschUI.action({ label: translate(h, 'starten'), text: translate(h, 'starten'), variant: 'primary', onClick: () => {
                runStationAction(card, action);
                dialog._goBack();
            } });
            go.setAttribute('data-action', 'confirm');
            actions.append(cancel, go);
            body.appendChild(actions);
        }
    };
    if (card._dialog && card._dialog.isConnected) card._dialog.show(view);
    else card._openDialog(view);
    return true;
}

/** The dock button's menu (DOCK-05): only what is possible now (R18); fleeting (R04). */
function stationMenu(card) {
    return {
        title: translate(card._hass, 'station'),
        kind: 'menu',
        watch: () => [card._opts.entity],
        render: (body, hass, dialog) => {
            const model = card._model();
            const list = document.createElement('div');
            list.className = 'menu';
            const close = () => { if (dialog.isConnected) dialog.close(); };
            for (const action of stationActions(model, (a) => a.menu)) list.append(...stationActionItem(card, model, hass, action, close));
            const state = model.state ? model.state.state : 'unavailable';
            if (!['docked', 'returning'].includes(state) && model.can('return_home')) {
                let sent = false;
                const back = BuschUI.action({ label: translate(hass, 'return'), text: translate(hass, 'return'), icon: CONTROLS.return.icon, variant: 'quiet', onClick: () => {
                    if (sent) return;
                    sent = true;
                    card._call('return', model.state);
                    close();
                } });
                back.classList.add('menu-item');
                back.setAttribute('data-station-action', 'return');
                list.appendChild(back);
            }
            const settings = viewLink(translate(hass, 'stationEinstellungen'), 'station-settings', 'mdi:tune-variant', () => dialog.show(stationView(card)));
            settings.setAttribute('data-station-action', 'settings');
            list.appendChild(settings);
            body.appendChild(list);
        }
    };
}

/** Which capability a tab needs (R18); it shows only with rows or actions too. */
const STATION_TAB_NEEDS = { wash: ['self_wash_base'], dry: ['self_wash_base', 'dust_bag_drying', 'manual_dust_bag_drying'], empty: ['auto_empty_base'] };

/** The last tab per vacuum and browser (R21); a blocked or full storage only forgets it. */
function storedTab(key, value) {
    try {
        const store = globalThis.localStorage;
        if (!store) return null;
        if (value === undefined) return store.getItem(key);
        store.setItem(key, value);
    } catch (error) {
        // shortcut: no storage (private mode, quota) = no memory; the view works without it.
    }
    return null;
}

/**
 * Station settings (DOCK-01…04): status on top, tabs wash/dry/empty with the
 * rows of device-settings (R08) and their actions, maintenance below.
 * Reached from the dock menu and from device settings → Station (same view).
 */
function stationView(card) {
    loadSettingTexts(card);
    const storeKey = 'busch-vacuum-card:dock-tab:' + card._opts.entity;
    let tab = storedTab(storeKey);
    return {
        title: translate(card._hass, 'gruppe_station'),
        kind: 'editor',
        watch: () => settingsWatch(card),
        render: (body, hass, dialog) => {
            const model = card._model();
            // Problems and running work open on top; the values that are fine fold away (R25).
            const items = stationStatus(model);
            const list = (part) => {
                const status = document.createElement('ul');
                status.className = 'station-status';
                status.setAttribute('aria-label', translate(hass, 'stationStatus'));
                for (const item of part) {
                    const line = document.createElement('li');
                    line.setAttribute('data-status', item.key);
                    line.setAttribute('data-level', item.level);
                    const symbol = BuschUI.ha.icon(item.icon);
                    symbol.setAttribute('aria-hidden', 'true');
                    const label = document.createElement('span');
                    label.className = 'setting-name';
                    label.textContent = item.label;
                    const value = document.createElement('span');
                    value.className = 'setting-value';
                    value.textContent = item.text;
                    line.append(symbol, label, value);
                    status.appendChild(line);
                }
                return status;
            };
            const open = items.filter((item) => item.level !== 'ok');
            const fine = items.filter((item) => item.level === 'ok');
            if (items.length) body.appendChild(list(open.length ? open : [{ key: 'station', level: 'ok', label: translate(hass, 'station'), text: translate(hass, 'stationOk'), icon: LEVEL_ICON.ok }]));
            if (fine.length) {
                const all = BuschUI.section({ title: translate(hass, 'alleWerte', { n: fine.length }), content: list(fine) });
                all.classList.add('station-values');
                body.appendChild(all);
            }

            const tabs = STATION_TABS.filter((name) => STATION_TAB_NEEDS[name].some((need) => model.can(need))
                && (groupKeys('station').some((key) => SETTINGS[key].tab === name && settingState(card, model, key).present) || stationActions(model, (a) => a.tab === name).length));
            if (!tabs.includes(tab)) tab = tabs[0];
            if (tab) {
                const select = (name, focus) => {
                    tab = name;
                    storedTab(storeKey, name);
                    dialog._render();
                    const node = focus && dialog.shadowRoot.querySelector('[data-tab="' + name + '"]');
                    if (node) node.focus();
                };
                const list = document.createElement('div');
                list.className = 'station-tabs';
                list.setAttribute('role', 'tablist');
                list.setAttribute('aria-label', translate(hass, 'gruppe_station'));
                tabs.forEach((name, index) => {
                    const label = translate(hass, 'reiter_' + name);
                    const button = BuschUI.action({ label, text: label, variant: name === tab ? 'primary' : 'quiet', onClick: () => select(name, false) });
                    button.setAttribute('role', 'tab');
                    button.setAttribute('data-tab', name);
                    button.id = 'station-tab-' + name;
                    button.setAttribute('aria-selected', String(name === tab));
                    button.setAttribute('aria-controls', 'station-panel');
                    button.tabIndex = name === tab ? 0 : -1;
                    button.addEventListener('keydown', (event) => {
                        const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[event.key];
                        if (next === undefined) return;
                        event.preventDefault();
                        select(tabs[(next + tabs.length) % tabs.length], true);
                    });
                    list.appendChild(button);
                });
                const panel = document.createElement('div');
                panel.id = 'station-panel';
                panel.setAttribute('role', 'tabpanel');
                panel.setAttribute('aria-labelledby', 'station-tab-' + tab);
                const rows = document.createElement('div');
                rows.className = 'settings-list';
                for (const key of groupKeys('station').filter((k) => SETTINGS[k].tab === tab)) {
                    const row = settingRow(card, model, key);
                    if (row) rows.appendChild(row);
                }
                panel.appendChild(rows);
                const actions = stationActions(model, (a) => a.tab === tab);
                if (actions.length) {
                    const menu = document.createElement('div');
                    menu.className = 'menu station-actions';
                    for (const action of actions) menu.append(...stationActionItem(card, model, hass, action));
                    panel.appendChild(menu);
                }
                body.append(list, panel);
            }

            const upkeep = stationActions(model, (a) => !a.tab);
            if (upkeep.length) {
                const heading = document.createElement('h2');
                heading.className = 'settings-heading';
                heading.textContent = translate(hass, 'wartung');
                const menu = document.createElement('div');
                menu.className = 'menu station-upkeep';
                for (const action of upkeep) menu.append(...stationActionItem(card, model, hass, action));
                body.append(heading, menu);
            }
        }
    };
}

// ---------------------------------------------------------------------------
// Shortcuts (shortcuts): scripts and device shortcuts, start, manage (SHO-01/02)
// ---------------------------------------------------------------------------

/**
 * The one list menu and management read (R08): configured scripts first
 * (missing ones left out, the editor names them), then the device's shortcuts
 * by `index` (attribute `shortcuts`, device.py#L11076, types.py#L5099).
 */
function shortcutEntries(hass, model, scripts) {
    const list = scripts.filter((id) => hass.states[id]).map((id) => {
        const state = hass.states[id];
        return { kind: 'script', id, name: String(state.attributes.friendly_name || objectIdOf(id)), icon: state.attributes.icon || 'mdi:script-text-outline', running: state.state === 'on', mapId: null };
    });
    const raw = model.can('shortcuts') ? model.attr('shortcuts') : null;
    const device = raw && typeof raw === 'object' ? Object.values(raw).filter((s) => s && s.id !== undefined && s.id !== null) : [];
    device.sort((a, b) => Number(a.index) - Number(b.index));
    for (const s of device) {
        list.push({ kind: 'device', id: Number(s.id), name: String(s.name === undefined || s.name === null ? s.id : s.name), icon: 'mdi:star-four-points-outline',
            running: !!s.running, mapId: s.map_id === undefined || s.map_id === null ? null : s.map_id });
    }
    return list;
}

/** The floor's name when a shortcut belongs to another map than the current one, else ''. */
function shortcutFloor(model, entry) {
    if (entry.mapId === null) return '';
    const maps = Array.isArray(model.attr('maps')) ? model.attr('maps') : [];
    const name = (m) => m.custom_name || m.name || String(m.id);
    const current = maps.find((m) => name(m) === model.attr('selected_map'));
    const own = maps.find((m) => m.id === entry.mapId);
    return own && (!current || current.id !== own.id) ? name(own) : '';
}

/** Menu text of an entry: name, floor if another, running as a word (R17). */
function shortcutText(hass, model, entry) {
    const floor = shortcutFloor(model, entry);
    return entry.name + (floor ? ' · ' + floor : '') + (entry.running ? ' · ' + translate(hass, 'laeuft') : '');
}

/**
 * The one start path (R08): `vacuum_start_shortcut { entity_id, shortcut_id }`
 * or `script.turn_on`. Never stops or pauses a running task first (TASK-07);
 * busy until the service answers, a second tap is ignored (R11).
 */
function startShortcut(card, entry, done) {
    const call = entry.kind === 'device'
        ? () => card._hass.callService('dreame_vacuum', 'vacuum_start_shortcut', { entity_id: card._opts.entity, shortcut_id: entry.id })
        : () => card._hass.callService('script', 'turn_on', { entity_id: entry.id });
    return trackWrite(card, 'shortcut:' + entry.kind + ':' + entry.id, { label: entry.name, failKey: 'shortcutFehler', call, done });
}

/** Why no shortcut can start now (device.py#L5281: draining), else ''. Self-repair only the service reports. */
const shortcutLock = (hass, model) => (model.attr('draining') === true ? translate(hass, 'sperreAblassen') : '');

/** One start item, for menu and management (R01): text, symbol, busy state, error note. */
function shortcutItem(card, model, hass, entry, done) {
    const track = 'shortcut:' + entry.kind + ':' + entry.id;
    const busy = card._settingWrites.has(track);
    const text = busy ? entry.name + ' · ' + translate(hass, 'wirdGestartet') : shortcutText(hass, model, entry);
    const locked = entry.kind === 'device' && !!shortcutLock(hass, model);
    const item = BuschUI.action({ label: text, text, icon: entry.icon, variant: 'quiet', disabled: busy || locked, onClick: () => startShortcut(card, entry, done) });
    item.classList.add('menu-item');
    item.setAttribute('data-shortcut', entry.kind + ':' + entry.id);
    if (busy) item.setAttribute('aria-busy', 'true');
    const note = card._settingNotes.get(track);
    if (!note) return [item];
    const line = noteLine(note, 'error');
    line.setAttribute('data-note', entry.kind + ':' + entry.id);
    return [item, line];
}

/** The shortcut button's menu (SHO-01): scripts, then shortcuts; fleeting (R04). */
function shortcutMenu(card) {
    return {
        title: translate(card._hass, 'shortcuts'),
        kind: 'menu',
        watch: () => [card._opts.entity, ...card._opts.scripts],
        render: (body, hass, dialog) => {
            const model = card._model();
            const entries = shortcutEntries(hass, model, card._opts.scripts);
            const close = () => { if (dialog.isConnected) dialog.close(); };
            if (taskActive(model, model.state ? model.state.state : 'unavailable')) {
                const note = noteLine(translate(hass, 'shortcutZusaetzlich'));
                note.setAttribute('data-note', 'task');
                body.appendChild(note);
            }
            const lock = shortcutLock(hass, model);
            if (lock && entries.some((e) => e.kind === 'device')) {
                const note = noteLine(lock);
                note.setAttribute('data-note', 'locked');
                body.appendChild(note);
            }
            for (const kind of ['script', 'device']) {
                const part = entries.filter((e) => e.kind === kind);
                if (!part.length) continue;
                const heading = document.createElement('h2');
                heading.className = 'settings-heading';
                heading.textContent = translate(hass, kind === 'script' ? 'skripte' : 'shortcuts');
                const list = document.createElement('div');
                list.className = 'menu';
                for (const entry of part) list.append(...shortcutItem(card, model, hass, entry, close));
                body.append(heading, list);
            }
            if (model.can('shortcut_manage')) body.appendChild(viewLink(translate(hass, 'verwalten'), 'manage', 'mdi:pencil-outline', () => dialog.show(shortcutManageView(card))));
        }
    };
}

/** Management (SHO-02): start, rename, delete per device shortcut; reload from the device (ALL-13). */
function shortcutManageView(card) {
    return {
        title: translate(card._hass, 'shortcutsVerwalten'),
        kind: 'editor',
        watch: () => [card._opts.entity],
        render: (body, hass, dialog) => {
            const model = card._model();
            const entries = shortcutEntries(hass, model, []);
            if (!entries.length) body.appendChild(noteLine(translate(hass, 'keineShortcuts')));
            const list = document.createElement('div');
            list.className = 'settings-list';
            for (const entry of entries) {
                const row = document.createElement('div');
                row.className = 'setting';
                row.setAttribute('data-manage', String(entry.id));
                const start = shortcutItem(card, model, hass, entry);
                start[0].classList.add('manage-start');
                row.append(...start);
                const rename = BuschUI.action({ label: translate(hass, 'umbenennen') + ': ' + entry.name, icon: 'mdi:pencil-outline', variant: 'icon-only',
                    onClick: () => dialog.show(shortcutRenameView(card, entry)) });
                rename.setAttribute('data-action', 'rename');
                const busy = card._settingWrites.has('delete:' + entry.id);
                const remove = BuschUI.action({ label: translate(hass, 'loeschen') + ': ' + entry.name, icon: 'mdi:delete-outline', variant: 'icon-only',
                    disabled: entry.running || busy, onClick: () => dialog.show(shortcutDeleteView(card, entry)) });
                remove.setAttribute('data-action', 'delete');
                if (busy) remove.setAttribute('aria-busy', 'true');
                row.append(rename, remove);
                if (entry.running) row.appendChild(noteLine(translate(hass, 'loeschenLaeuft')));
                const note = card._settingNotes.get('delete:' + entry.id);
                if (note) row.appendChild(noteLine(note, 'error'));
                list.appendChild(row);
            }
            body.appendChild(list);
            const busy = card._settingWrites.has('reload_shortcuts');
            const label = translate(hass, 'neuLaden');
            const reload = BuschUI.action({ label, text: busy ? translate(hass, 'wirdGestartet') : label, icon: 'mdi:refresh', disabled: busy,
                onClick: () => callAction(card, 'reload_shortcuts', undefined, { label, failKey: 'shortcutFehler' }) });
            reload.setAttribute('data-action', 'reload');
            if (busy) reload.setAttribute('aria-busy', 'true');
            const actions = document.createElement('div');
            actions.className = 'actions';
            actions.appendChild(reload);
            body.appendChild(actions);
            const note = card._settingNotes.get('reload_shortcuts');
            if (note) body.appendChild(noteLine(note, 'error'));
        }
    };
}

/**
 * Rename form (R10): required, unchanged = no save, locked during a task
 * (device.py#L6321). The draft survives leaving and a failed save (R04/R12).
 */
function shortcutRenameView(card, entry) {
    const key = 'shortcut-name:' + entry.id;
    const track = 'rename:' + entry.id;
    if (!card._drafts.has(key)) card._drafts.set(key, entry.name);
    let checked = false;
    return {
        title: translate(card._hass, 'umbenennen') + ': ' + entry.name,
        kind: 'editor',
        watch: () => [card._opts.entity],
        render: (body, hass, dialog) => {
            const model = card._model();
            const locked = taskActive(model, model.state ? model.state.state : 'unavailable');
            const busy = card._settingWrites.has(track);
            const error = () => (checked && !card._drafts.get(key).trim() ? translate(hass, 'nameFehlt') : '');
            if (card._drafts.get(key) !== entry.name) body.appendChild(noteLine(translate(hass, 'ungespeichert'), 'dirty'));
            if (locked) body.appendChild(noteLine(translate(hass, 'sperre_idle')));
            const failed = card._settingNotes.get(track);
            if (failed) body.appendChild(noteLine(failed + ' ' + translate(hass, 'eingabenBleiben'), 'error'));
            const input = document.createElement('input');
            input.setAttribute('type', 'text');
            input.setAttribute('aria-required', 'true');
            input.setAttribute('autocomplete', 'off');
            input.value = card._drafts.get(key);
            const field = formField('shortcut_name', translate(hass, 'feld_shortcut_name'), input, error());
            body.append(field.wrap, noteLine(translate(hass, 'nameNummer')));
            const actions = document.createElement('div');
            actions.className = 'actions';
            const save = BuschUI.action({ label: translate(hass, 'speichern'), text: translate(hass, busy ? 'speichert' : 'speichern'), variant: 'primary', onClick: () => {
                checked = true;
                const name = card._drafts.get(key).trim();
                if (!name) { field.update(error()); return; }
                trackWrite(card, track, {
                    label: entry.name,
                    call: () => card._hass.callService('dreame_vacuum', 'vacuum_rename_shortcut', { entity_id: card._opts.entity, shortcut_id: entry.id, shortcut_name: name }),
                    done: () => { card._drafts.delete(key); dialog._goBack(); }
                });
            } });
            save.setAttribute('data-action', 'save');
            const able = () => { save.disabled = locked || busy || card._drafts.get(key) === entry.name; };
            able();
            if (busy) save.setAttribute('aria-busy', 'true');
            input.addEventListener('input', () => {
                card._drafts.set(key, input.value);
                field.update(error());
                able();
            });
            actions.appendChild(save);
            body.appendChild(actions);
        }
    };
}

/** Delete asks first and names the shortcut (R13). */
function shortcutDeleteView(card, entry) {
    return {
        title: translate(card._hass, 'loeschen') + '?',
        kind: 'confirm',
        render: (body, hass, dialog) => {
            body.appendChild(noteLine(translate(hass, 'frageShortcutLoeschen', { name: entry.name })));
            const actions = document.createElement('div');
            actions.className = 'actions';
            const cancel = BuschUI.action({ label: translate(hass, 'abbrechen'), text: translate(hass, 'abbrechen'), onClick: () => dialog._goBack() });
            cancel.setAttribute('data-action', 'cancel');
            const go = BuschUI.action({ label: translate(hass, 'loeschen'), text: translate(hass, 'loeschen'), variant: 'primary', onClick: () => {
                trackWrite(card, 'delete:' + entry.id, {
                    label: entry.name,
                    call: () => card._hass.callService('dreame_vacuum', 'vacuum_delete_shortcut', { entity_id: card._opts.entity, shortcut_id: entry.id })
                });
                dialog._goBack();
            } });
            go.setAttribute('data-action', 'confirm');
            actions.append(cancel, go);
            body.appendChild(actions);
        }
    };
}

// ---------------------------------------------------------------------------
// History (history): runs of the history sensors (HIS-01…03); map and data of
// one run are fetched only while its detail is open
// ---------------------------------------------------------------------------

const SQFT_PER_SQM = 10.7639;

/** HA's unit system: US customary shows ft² (CORE-04). */
const areaFeet = (hass) => !!(hass && hass.config && hass.config.unit_system && hass.config.unit_system.length === 'mi');

/** The number of a text like "34 m²" or "51 min", else null. */
function leadingNumber(text) {
    const value = parseFloat(String(text === undefined || text === null ? '' : text).replace(',', '.'));
    return Number.isFinite(value) ? value : null;
}

/**
 * Runs of a history sensor, newest first by `timestamp` (the attribute keys
 * are display text without a year). `level`: interrupted (`completed: false`),
 * notice (blocked rooms or an interrupt reason), done. `group`: the shared
 * `multiple_cleaning_time` of a cleaning and its re-cleaning, only for two or more.
 */
function historyRuns(stateObj) {
    const attrs = (stateObj && stateObj.attributes) || {};
    const runs = Object.entries(attrs)
        .filter(([, e]) => e && typeof e === 'object' && !Array.isArray(e) && Number.isFinite(Number(e.timestamp)))
        .map(([key, e]) => {
            const blocked = e.blocked_rooms && typeof e.blocked_rooms === 'object' ? Object.keys(e.blocked_rooms) : [];
            const level = e.completed === false ? 'interrupted' : blocked.length || e.interrupt_reason ? 'notice' : 'done';
            const mct = e.multiple_cleaning_time;
            return { key, timestamp: Number(e.timestamp), level, group: mct === undefined || mct === null ? null : String(mct), entry: e };
        })
        .sort((a, b) => b.timestamp - a.timestamp);
    const count = new Map();
    for (const r of runs) if (r.group) count.set(r.group, (count.get(r.group) || 0) + 1);
    for (const r of runs) if (r.group && count.get(r.group) < 2) r.group = null;
    return runs;
}

/** An area in m² as text in HA's units. */
function areaText(hass, sqm) {
    return areaFeet(hass) ? Math.round(sqm * SQFT_PER_SQM) + ' ft²' : Math.round(sqm) + ' m²';
}

/** Minutes as "1 h 15 min" / "25 min". */
function minutesText(hass, minutes) {
    const m = Math.round(minutes);
    return m >= 60 ? translate(hass, 'dauerStdMin', { h: Math.floor(m / 60), m: m % 60 }) : translate(hass, 'dauerMin', { m });
}

/** Area, time and count of the runs shown; numbers read from "<n> m²" / "<n> min". */
function historySums(runs, hass) {
    let area = 0, minutes = 0;
    for (const r of runs) {
        area += leadingNumber(r.entry.cleaned_area) || 0;
        minutes += leadingNumber(r.entry.cleaning_time !== undefined ? r.entry.cleaning_time : r.entry.cruising_time) || 0;
    }
    return { count: runs.length, area, minutes, areaText: areaText(hass, area), timeText: minutesText(hass, minutes) };
}

/** The two history views: sensor (by translation key), camera attribute of the run pictures. */
const HISTORY_KINDS = {
    history: { sensor: 'sensor.cleaning_history', picture: 'cleaning_history_picture', title: 'entryHistory', cruising: false },
    cruising_history: { sensor: 'sensor.cruising_history', picture: 'cruising_history_picture', title: 'entryCruising', cruising: true }
};

/** Status dot of a run: symbol and word, never colour alone (R17). */
const RUN_LEVELS = {
    done: { icon: 'mdi:check-circle-outline', text: 'laufFertig' },
    notice: { icon: 'mdi:alert-outline', text: 'laufAuffaellig' },
    interrupted: { icon: 'mdi:close-octagon-outline', text: 'laufUnterbrochen' }
};
const RUN_LEVEL_ORDER = ['done', 'notice', 'interrupted'];

/** A state text of the integration's sensor in HA's words (R26), else the raw text. */
function integrationState(hass, sensor, raw) {
    if (raw === undefined || raw === null || raw === '') return '';
    const slug = enumName(raw);
    for (const name of [slug, slug.replace(/_mode$/, '')]) {
        const id = 'component.dreame_vacuum.entity.sensor.' + sensor + '.state.' + name;
        const text = hass && typeof hass.localize === 'function' ? hass.localize(id) : '';
        if (text && text !== id) return text;
    }
    const words = String(raw).replace(/_/g, ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Date and time of a run as HA shows them (CORE-16); the year only when it is not this one. */
function runDateText(hass, timestamp) {
    const date = new Date(timestamp * 1000);
    const options = { weekday: 'short', day: '2-digit', month: '2-digit' };
    if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric';
    let day;
    try {
        day = new Intl.DateTimeFormat(localeOf(hass).language, options).format(date);
    } catch (e) {
        day = date.toLocaleDateString();
    }
    return day + ' ' + clockText(hass, date.getHours(), date.getMinutes());
}

const runsText = (hass, n) => translate(hass, n === 1 ? 'einLauf' : 'laeufe', { n });

function runStatus(hass, level) {
    const chip = document.createElement('span');
    chip.className = 'run-status';
    chip.setAttribute('data-level', level);
    const icon = BuschUI.ha.icon(RUN_LEVELS[level].icon);
    icon.setAttribute('aria-hidden', 'true');
    const word = document.createElement('span');
    word.textContent = translate(hass, RUN_LEVELS[level].text);
    chip.append(icon, word);
    return chip;
}

/** One line of a run (or of a group head): title, facts, status. */
function runLine(button, title, facts, status) {
    const text = document.createElement('span');
    text.className = 'run-text';
    const head = document.createElement('span');
    head.className = 'run-title';
    head.textContent = title;
    const meta = document.createElement('span');
    meta.className = 'run-meta';
    meta.textContent = facts.filter(Boolean).join(' · ');
    text.append(head, meta);
    button.append(text, status);
    return button;
}

/** Area and duration of one run in HA's units ("—" stays out). */
function runFacts(hass, run) {
    const area = leadingNumber(run.entry.cleaned_area);
    const minutes = leadingNumber(run.entry.cleaning_time !== undefined ? run.entry.cleaning_time : run.entry.cruising_time);
    return [area === null ? '' : areaText(hass, area), minutes === null ? '' : minutesText(hass, minutes)];
}

/** The runs of a view, recomputed only for a new sensor object (R20). */
function historyRunsOf(card, kind, state, hass) {
    const id = card._model().entity(kind.sensor);
    const obj = id ? hass.states[id] : null;
    if (!state.cache || state.cache.obj !== obj) state.cache = { obj, runs: obj && !UNUSABLE.includes(obj.state) ? historyRuns(obj) : [] };
    return state.cache.runs;
}

/**
 * HIS-01/03: the list. Runs newest first; a cleaning and its re-cleaning as
 * one group (head with sums, Shift+Plus/Minus or a tap opens it, R03); sums
 * of the runs shown; empty without runs or without cloud (R18).
 */
function historyView(card, name) {
    loadSettingTexts(card);
    const kind = HISTORY_KINDS[name];
    // Open groups, the run to return to, the detail's loads: only while the view lives (R21).
    const state = { cache: null, open: new Set(), back: null, scroll: 0, detail: null };
    return {
        title: translate(card._hass, kind.title),
        kind: 'editor',
        watch: () => [card._model().entity(kind.sensor)].filter(Boolean),
        render: (body, hass, dialog) => {
            const runs = historyRunsOf(card, kind, state, hass);
            if (!runs.length) {
                const empty = document.createElement('p');
                empty.className = 'history-empty';
                empty.setAttribute('role', 'status');
                empty.textContent = translate(hass, 'verlaufLeer');
                body.appendChild(empty);
                return;
            }
            const sums = historySums(runs, hass);
            const total = document.createElement('p');
            total.className = 'history-sums';
            total.textContent = [runsText(hass, sums.count), kind.cruising ? '' : sums.areaText, sums.timeText].filter(Boolean).join(' · ');
            const list = document.createElement('div');
            list.className = 'history-list';
            list.setAttribute('role', 'list');
            const toggle = (group, open) => {
                if (open === state.open.has(group)) return;
                if (open) state.open.add(group);
                else state.open.delete(group);
                dialog._render();
                const head = Array.from(dialog.shadowRoot.querySelectorAll('[data-group]')).find((n) => n.getAttribute('data-group') === group);
                if (head) head.focus();
            };
            const row = (run) => {
                const button = document.createElement('button');
                button.className = 'history-run';
                button.setAttribute('type', 'button');
                button.setAttribute('data-run', String(run.timestamp));
                button.addEventListener('click', () => {
                    state.back = run.timestamp;
                    state.scroll = dialog._sheet ? dialog._sheet.scrollTop : 0;
                    dialog.show(historyDetail(card, name, state, run.timestamp));
                });
                const status = integrationState(hass, 'status', run.entry.status);
                return runLine(button, [runDateText(hass, run.timestamp), status].filter(Boolean).join(' · '), runFacts(hass, run), runStatus(hass, run.level));
            };
            const done = new Set();
            for (const run of runs) {
                if (run.group && done.has(run.group)) continue;
                const item = document.createElement('div');
                item.setAttribute('role', 'listitem');
                if (!run.group) {
                    item.appendChild(row(run));
                    list.appendChild(item);
                    continue;
                }
                done.add(run.group);
                const members = runs.filter((r) => r.group === run.group);
                const open = state.open.has(run.group);
                const head = document.createElement('button');
                head.className = 'history-run history-group';
                head.setAttribute('type', 'button');
                head.setAttribute('data-group', run.group);
                head.setAttribute('aria-expanded', String(open));
                const s = historySums(members, hass);
                const worst = members.reduce((w, r) => (RUN_LEVEL_ORDER.indexOf(r.level) > RUN_LEVEL_ORDER.indexOf(w) ? r.level : w), 'done');
                runLine(head, runDateText(hass, members.at(-1).timestamp) + ' · ' + translate(hass, 'gruppeTitel'),
                    [runsText(hass, s.count), kind.cruising ? '' : s.areaText, s.timeText], runStatus(hass, worst));
                const chevron = BuschUI.ha.icon(open ? 'mdi:chevron-up' : 'mdi:chevron-down');
                chevron.setAttribute('aria-hidden', 'true');
                head.insertBefore(chevron, head.firstChild);
                head.addEventListener('click', () => toggle(run.group, !open));
                head.addEventListener('keydown', (event) => {
                    const want = event.key === '+' ? true : event.key === '-' ? false : null;
                    if (want === null) return;
                    event.preventDefault();
                    toggle(run.group, want);
                });
                item.appendChild(head);
                if (open) {
                    const inner = document.createElement('div');
                    inner.className = 'history-members';
                    inner.setAttribute('role', 'list');
                    for (const member of members) {
                        const li = document.createElement('div');
                        li.setAttribute('role', 'listitem');
                        li.appendChild(row(member));
                        inner.appendChild(li);
                    }
                    item.appendChild(inner);
                }
                list.appendChild(item);
            }
            body.append(total, list);
            if (state.back !== null) {
                // Back from a detail: the list where it was, the focus on the run seen last (R14).
                const back = state.back, scroll = state.scroll || 0;
                state.back = null;
                abortRun(state.detail || { loads: new Map() });
                requestAnimationFrame(() => {
                    if (dialog._sheet) dialog._sheet.scrollTop = scroll;
                    const run = runs.find((r) => r.timestamp === back);
                    const nodes = Array.from(dialog.shadowRoot.querySelectorAll('[data-run], [data-group]'));
                    const node = nodes.find((n) => n.getAttribute('data-run') === String(back)) || (run && run.group && nodes.find((n) => n.getAttribute('data-group') === run.group));
                    if (node) node.focus();
                });
            }
        }
    };
}

/** The main map camera (map_index 0): only it serves the history endpoints (camera.py#L253). */
const historyCamera = (card) => card._model().related.maps.map[0] || null;

const hassUrl = (hass, path) => (hass && typeof hass.hassUrl === 'function' ? hass.hassUrl(path) : path);

/**
 * The URL of a run from the camera's current attribute, matched by `v=` (the
 * run's timestamp; the index moves with every new run). `data`: map data
 * (gzip JSON); else the picture without burnt-in text, cleaning or WiFi map.
 */
function historyUrl(camera, run, { kind = 'history', data = false, wifi = false } = {}) {
    const pictures = camera && camera.attributes && camera.attributes[HISTORY_KINDS[kind].picture];
    if (!pictures || typeof pictures !== 'object') return null;
    const v = String(Math.trunc(run.timestamp));
    const base = Object.values(pictures).find((url) => typeof url === 'string' && (/[?&]v=(\d+)/.exec(url) || [])[1] === v);
    if (!base) return null;
    if (data) return base + '&data=1';
    return base + '&info=0' + (HISTORY_KINDS[kind].cruising ? '' : wifi ? '&wifi=1' : '&cleaning=1');
}

/** The `index` of a run's URL (the integration's position in its list), for the obstacle photos. */
const historyIndex = (url) => (url ? (/[?&]index=(\d+)/.exec(url) || [])[1] || null : null);

/**
 * The run's map data (`&data=1`): once per run and view, only for the open
 * detail; a page turn or closing aborts the one under way (R20).
 */
function loadRun(card, kind, run, detail, redraw) {
    const ts = run.timestamp;
    if (detail.loads.has(ts)) return detail.loads.get(ts);
    abortRun(detail);
    const url = historyUrl(card._hass.states[historyCamera(card)], run, { kind: kind.name, data: true });
    const load = { status: url ? 'loading' : 'missing', data: null, error: '' };
    detail.loads.set(ts, load);
    if (!url) return load;
    if (typeof fetch !== 'function') return Object.assign(load, { status: 'error', error: 'fetch' });
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    detail.controller = controller;
    Promise.resolve().then(() => fetch(hassUrl(card._hass, url), controller ? { signal: controller.signal } : {})).then((res) => {
        if (res.status === 404) return { status: 'missing' };
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json().then((data) => ({ status: 'ready', data }));
    }).then((result) => {
        if (detail.loads.get(ts) !== load) return;
        Object.assign(load, result);
        if (detail.controller === controller) detail.controller = null;
        redraw();
    }, (error) => {
        if (detail.loads.get(ts) !== load || (error && error.name === 'AbortError')) return;
        Object.assign(load, { status: 'error', error: errorText(error) });
        if (detail.controller === controller) detail.controller = null;
        redraw();
    });
    return load;
}

/** Aborts the fetch under way; its unfinished entry goes, so a later visit loads again. */
function abortRun(detail) {
    if (detail.controller) detail.controller.abort();
    detail.controller = null;
    for (const [ts, load] of detail.loads) if (load.status === 'loading') detail.loads.delete(ts);
}

/** StartupMethod of the map data (types.py#L4633) → state key of the integration's sensor. */
const STARTUP_METHODS = { 0: 'button', 1: 'app', 2: 'scheduled', 3: 'voice' };

/** Room name from the camera, else "Room <id>". */
function historyRoomName(hass, rooms, id) {
    return rooms[id] ? roomName(rooms[id], id) : translate(hass, 'raumNr', { id });
}

/** Blocked rooms of a run: the sensor's reasons, plus rooms only the map data names. */
function blockedRooms(run, load) {
    const out = new Map(Object.entries(run.entry.blocked_rooms && typeof run.entry.blocked_rooms === 'object' ? run.entry.blocked_rooms : {}));
    const data = load && load.data && load.data.blocked_segments;
    if (data && typeof data === 'object') for (const id of Object.keys(data)) if (!out.has(id)) out.set(id, '');
    return out;
}

/** The facts of a run: [name, label key, text, from the map data]. */
function runFactRows(hass, kind, run, load) {
    const e = run.entry;
    const data = load.status === 'ready' ? load.data || {} : null;
    const fromData = (value) => (data && value !== undefined && value !== null ? String(value) : null);
    const [area, duration] = runFacts(hass, run);
    if (kind.cruising) {
        return [
            ['duration', 'verlaufDauer', duration], ['cruising_type', 'verlaufArt', e.cruising_type === undefined ? '' : String(e.cruising_type)],
            ['map_name', 'verlaufKarte', e.map_name || '']
        ];
    }
    const startup = data && data.startup_method !== undefined && data.startup_method !== null ? integrationState(hass, 'startup_method', STARTUP_METHODS[data.startup_method] || 'unknown') : null;
    return [
        ['area', 'verlaufFlaeche', area], ['duration', 'verlaufDauer', duration],
        ['suction_level', 'verlaufSaugstufe', e.suction_level ? optionLabel(hass, 'suction_level', e.suction_level) : ''],
        ['mop_pad', 'verlaufMop', e.mop_pad || ''], ['water_tank', 'verlaufTank', e.water_tank || ''],
        ['cleanup_method', 'verlaufArt', integrationState(hass, 'cleanup_method', e.cleanup_method)],
        ['startup_method', 'verlaufStart', startup, true],
        ['dust_collection_count', 'verlaufEntleert', fromData(data && data.dust_collection_count), true],
        ['mop_wash_count', 'verlaufGewaschen', fromData(data && data.mop_wash_count), true],
        ['interrupt_reason', 'verlaufGrund', e.interrupt_reason || ''],
        ['pet', 'verlaufHaustier', typeof e.pet === 'boolean' ? translate(hass, e.pet ? 'ja' : 'nein') : '']
    ];
}

/** The note of the map data's state (R11/R12/R18); error with Retry. */
function runLoadNote(hass, load, retry) {
    if (load.status === 'ready') return null;
    const key = { loading: 'laedtLauf', missing: 'keineLaufdaten', error: 'laufFehler' }[load.status];
    const note = noteLine(translate(hass, key, { grund: load.error }), load.status === 'error' ? 'error' : undefined);
    note.setAttribute('data-load', load.status);
    if (load.status === 'error') {
        const again = BuschUI.action({ label: translate(hass, 'erneut'), text: translate(hass, 'erneut'), icon: 'mdi:refresh', onClick: retry });
        again.setAttribute('data-action', 'retry');
        note.appendChild(again);
    }
    return note;
}

/** ObstacleType of the map data (types.py#L2749), named as the integration names them in the camera's attributes. */
const OBSTACLE_TYPES = {
    128: 'base', 129: 'scale', 130: 'thread', 131: 'wire', 132: 'toy', 133: 'shoes', 134: 'sock', 135: 'fece',
    136: 'trash_can', 137: 'fabric', 138: 'power_strip', 139: 'liquid_stain', 142: 'obstacle', 158: 'pet',
    163: 'cleaning_tools', 169: 'detected_stain', 200: 'blocked_room', 201: 'easy_to_stuck_furniture',
    202: 'uncleanable_stain', 204: 'leg', 205: 'large_particles', 206: 'dried_stain', 209: 'food_bowl', 210: 'pet_bed',
    214: 'cleaned_stain', 215: 'skipped_uncleanable_stain', 216: 'cleaned_dried_stain', 217: 'cleaned_large_particles',
    225: 'hair', 226: 'paper', 228: 'cleaned_hair', 229: 'sundry'
};
const obstacleTypeText = (code) => (OBSTACLE_TYPES[code] || 'unknown').split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

/**
 * Obstacles of a run from its map data (map.py get_data: [key, x, y, type,
 * possibility, ignore, picture_status, id, …, room name, colour, segment, reason]);
 * blocked rooms are listed above already.
 */
function runObstacles(data, rooms) {
    return (Array.isArray(data && data.obstacles) ? data.obstacles : []).filter((o) => Array.isArray(o) && Number(o[3]) !== 200).map((o) => ({
        key: String(o[0]), x: Number(o[1]), y: Number(o[2]), type: obstacleTypeText(Number(o[3])),
        photo: Number(o[6]) === 2, // ObstaclePictureStatus.UPLOADED: only then is there a picture (map.py#L1233)
        room: (o[14] !== null && o[14] !== undefined && rooms[o[14]] ? roomName(rooms[o[14]], o[14]) : o[12]) || '', reason: o[15] || ''
    }));
}

const svgNode = (tag, attrs) => MapView.prototype.svgNode(tag, attrs);
const HISTORY_ZOOMS = [1, 1.5, 2, 3, 4];

/** The run's picture in data mode: painted once per run, map and colours into a canvas kept by the view (R20). */
function runCanvas(card, hass, detail, key, grid, segments) {
    const c = (card._map && card._map._colors) || MAP_SCHEMES[darkMode(hass) ? 'dark' : 'light'];
    const id = key + ':' + JSON.stringify(c);
    const kept = detail.canvases.get(key);
    if (kept && kept.id === id) return kept.canvas;
    const picture = paintMapPixels(grid, {
        floor: parseColor(c.floor), wall: parseColor(c.wall), carpet: parseColor(c.carpet),
        rooms: c.room.map((v) => parseColor(v)), room: parseColor(c.room[0])
    }, { rooms: Object.fromEntries((Array.isArray(segments) ? segments : []).filter(Array.isArray).map((g) => [g[0], { color_index: g[6] }])) });
    const canvas = (kept && kept.canvas) || document.createElement('canvas');
    canvas.className = 'history-map-canvas';
    canvas.setAttribute('role', 'img');
    canvas.width = picture.width;
    canvas.height = picture.height;
    const ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
    if (ctx && typeof ImageData === 'function') ctx.putImageData(new ImageData(picture.data, picture.width, picture.height), 0, 0);
    detail.canvases.set(key, { id, canvas });
    return canvas;
}

/**
 * HIS-02 map: cleaning or WiFi map of the run (tabs only with `wifi_map_data`),
 * data mode from the loaded map data, image mode (PNG `info=0`) only when the
 * data holds no map; zoom by buttons (R22); obstacles as list and markers.
 */
function runMapSection(card, hass, kind, run, load, detail, dialog) {
    const section = document.createElement('div');
    section.className = 'history-map';
    if (load.status !== 'ready') return null;
    const data = load.data || {};
    const wifiData = !kind.cruising && data.wifi_map_data && typeof data.wifi_map_data === 'object' ? data.wifi_map_data : null;
    const tab = wifiData && detail.tab === 'wifi' ? 'wifi' : 'cleaning';
    const date = runDateText(hass, run.timestamp);
    const alt = translate(hass, tab === 'wifi' ? 'wlanKarteAlt' : 'laufKarteAlt', { datum: date });
    if (wifiData) {
        const tabs = ['cleaning', 'wifi'];
        const list = document.createElement('div');
        list.className = 'station-tabs';
        list.setAttribute('role', 'tablist');
        list.setAttribute('aria-label', translate(hass, 'laufKarte'));
        const select = (name, focus) => {
            detail.tab = name;
            dialog._render();
            const node = focus && dialog.shadowRoot.querySelector('[data-tab="' + name + '"]');
            if (node) node.focus();
        };
        tabs.forEach((name, i) => {
            const label = translate(hass, name === 'wifi' ? 'wlanKarte' : 'reinigungsKarte');
            const button = BuschUI.action({ label, text: label, variant: name === tab ? 'primary' : 'quiet', onClick: () => select(name, false) });
            button.setAttribute('role', 'tab');
            button.setAttribute('data-tab', name);
            button.setAttribute('aria-selected', String(name === tab));
            button.tabIndex = name === tab ? 0 : -1;
            button.addEventListener('keydown', (event) => {
                const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[event.key];
                if (next === undefined) return;
                event.preventDefault();
                event.stopPropagation(); // ←/→ here switch maps, not runs
                select(tabs[(next + tabs.length) % tabs.length], true);
            });
            list.appendChild(button);
        });
        section.appendChild(list);
    }
    const source = tab === 'wifi' ? wifiData : data.cleaning_map_data && typeof data.cleaning_map_data === 'object' ? data.cleaning_map_data : data;
    const grid = decodeMapData(source);
    const key = run.timestamp + ':' + tab;
    const stage = document.createElement('div');
    stage.className = 'history-map-stage';
    const zoom = detail.zoom || 1;
    stage.setAttribute('data-zoom', String(zoom));
    stage.style.width = zoom * 100 + '%';
    const rooms = cameraAttrs(card._model()).rooms || {};
    const obstacles = tab === 'cleaning' ? runObstacles(data, rooms) : [];
    if (grid) {
        const canvas = runCanvas(card, hass, detail, key, grid, source.segments);
        canvas.setAttribute('aria-label', alt);
        stage.appendChild(canvas);
        // Path and obstacle markers over the canvas, in its pixels (gridAffine as the live map).
        const m = gridAffine(grid).matrix;
        const svg = svgNode('svg', { class: 'history-map-overlay', viewBox: '0 0 ' + canvas.width + ' ' + canvas.height, 'aria-hidden': 'true' });
        if (tab === 'cleaning') {
            (Array.isArray(source.path) ? source.path : []).forEach((stroke, i) => {
                const pts = [];
                for (let j = 1; j + 1 < stroke.length; j += 2) {
                    const p = applyAffine(m, { x: stroke[j], y: stroke[j + 1] });
                    pts.push(p.x + ',' + p.y);
                }
                svg.appendChild(svgNode('polyline', { 'data-path': i, 'data-kind': stroke[0], points: pts.join(' ') }));
            });
        }
        for (const o of obstacles) {
            const p = applyAffine(m, o);
            svg.appendChild(svgNode('rect', { 'data-marker': o.key, x: p.x - 2, y: p.y - 2, width: 4, height: 4, transform: 'rotate(45 ' + p.x + ' ' + p.y + ')' }));
        }
        stage.appendChild(svg);
    } else if (!(detail.failed && detail.failed.has(key))) {
        const img = document.createElement('img');
        img.className = 'history-map-img';
        img.setAttribute('src', hassUrl(hass, historyUrl(hass.states[historyCamera(card)], run, { kind: kind.name, wifi: tab === 'wifi' })));
        img.setAttribute('alt', alt);
        img.addEventListener('error', () => {
            (detail.failed || (detail.failed = new Set())).add(key);
            dialog._render();
        });
        stage.appendChild(img);
    } else {
        const note = noteLine(translate(hass, tab === 'wifi' ? 'keineWlanKarte' : 'keineLaufKarte'));
        note.setAttribute('data-map', 'missing');
        section.appendChild(note);
        return section;
    }
    const frame = document.createElement('div');
    frame.className = 'history-map-frame';
    frame.appendChild(stage);
    const tools = document.createElement('div');
    tools.className = 'history-zoom';
    const step = (to) => {
        detail.zoom = HISTORY_ZOOMS[Math.max(0, Math.min(HISTORY_ZOOMS.length - 1, to))];
        dialog._render();
    };
    const at = HISTORY_ZOOMS.indexOf(zoom);
    for (const [action, icon, label, to, off] of [['zoom-out', 'mdi:minus', 'zoomOut', at - 1, at <= 0], ['zoom-fit', 'mdi:fit-to-screen-outline', 'zoomFit', 0, at <= 0],
        ['zoom-in', 'mdi:plus', 'zoomIn', at + 1, at >= HISTORY_ZOOMS.length - 1]]) {
        const button = BuschUI.action({ label: translate(hass, label), icon, variant: 'icon-only', disabled: off, onClick: () => step(to) });
        button.setAttribute('data-action', action);
        tools.appendChild(button);
    }
    section.append(frame, tools);
    if (obstacles.length) {
        const heading = document.createElement('h2');
        heading.className = 'settings-heading';
        heading.textContent = translate(hass, 'laufHindernisse');
        const list = document.createElement('div');
        list.className = 'menu';
        for (const o of obstacles) {
            const label = [o.type, o.room].filter(Boolean).join(' · ');
            const item = BuschUI.action({ label, text: label, icon: o.photo ? 'mdi:camera-outline' : 'mdi:alert-outline', variant: 'quiet',
                onClick: () => dialog.show(runObstacleView(card, kind, run, o)) });
            item.classList.add('menu-item');
            item.setAttribute('data-obstacle', o.key);
            list.appendChild(item);
        }
        section.append(heading, list);
    }
    return section;
}

/** Photo endpoint of a run's obstacle (camera.py#L210): index of the obstacle, history_index of the run. */
function runObstacleUrl(hass, card, kind, run, key, file) {
    const camera = hass.states[historyCamera(card)];
    const n = historyIndex(historyUrl(camera, run, { kind: kind.name }));
    const token = (camera && camera.attributes.access_token) || '';
    return hassUrl(hass, '/api/camera_map_obstacle_history_proxy/' + historyCamera(card) + '?token=' + encodeURIComponent(token) + '&index=' + encodeURIComponent(key)
        + '&history_index=' + n + (kind.cruising ? '&cruising=1' : '') + (file ? '&file=1' : ''));
}

/** An obstacle of an old run: facts and photo with download, no ignoring (works only on the current map, MAP-04). */
function runObstacleView(card, kind, run, o) {
    return {
        title: translate(card._hass, 'hindernis'),
        kind: 'editor',
        render: (body, hass) => {
            const facts = document.createElement('dl');
            facts.className = 'obstacle-facts';
            for (const [key, value] of [['hindernisTyp', o.type], ['hindernisRaum', o.room], ['hindernisGrund', o.reason]]) {
                if (!value) continue;
                const dt = document.createElement('dt');
                dt.textContent = translate(hass, key);
                const dd = document.createElement('dd');
                dd.textContent = String(value);
                facts.append(dt, dd);
            }
            body.appendChild(facts);
            if (!o.photo) {
                const notes = document.createElement('div');
                notes.className = 'obstacle-note';
                notes.appendChild(noteLine(translate(hass, 'fotoFehlt')));
                body.appendChild(notes);
                return;
            }
            const img = document.createElement('img');
            img.className = 'obstacle-photo';
            img.setAttribute('src', runObstacleUrl(hass, card, kind, run, o.key));
            img.setAttribute('alt', translate(hass, 'fotoAlt'));
            const actions = document.createElement('div');
            actions.className = 'actions';
            const link = document.createElement('a');
            link.className = 'busch-ui-action link-action';
            link.setAttribute('data-action', 'obstacle-download');
            link.setAttribute('href', runObstacleUrl(hass, card, kind, run, o.key, true));
            link.setAttribute('download', '');
            link.textContent = translate(hass, 'fotoLaden');
            actions.appendChild(link);
            body.append(img, actions);
        }
    };
}

/**
 * "Nochmal reinigen" of a run (device.py#L5630): shown only for the newest
 * run with blocked rooms, `auto_recleaning` and `vacuum_call_action`; possible
 * only when the run's map is the current one and no task runs.
 */
function recleanState(model, run, { newest, load, mapId }) {
    const rooms = [...blockedRooms(run, load).keys()];
    const hidden = { show: false, ok: false, reason: null, rooms };
    if (!newest || run.timestamp !== newest.timestamp || !rooms.length || !model.can('auto_recleaning') || !model.can('dreame_vacuum.vacuum_call_action')) return hidden;
    const no = (reason) => ({ show: true, ok: false, reason, rooms });
    if (taskActive(model, model.state ? model.state.state : 'unavailable')) return no('nachAufgabeLaeuft');
    if (!load || load.status !== 'ready') return no(load && load.status === 'loading' ? 'nachLaedt' : 'nachOhneDaten');
    const runMap = load.data && load.data.map_id;
    if (runMap === undefined || runMap === null || String(runMap) !== String(mapId)) return no('nachAndereKarte');
    return { show: true, ok: true, reason: null, rooms };
}

/**
 * All blocked rooms: the station action `start_recleaning` (same entry as in
 * dock, R01/R08). Some: a new room run over the same payload as clean-tasks,
 * not coupled to the old run — the confirmation says so (decision 10.11.2026).
 */
function runReclean(card, rooms, all) {
    if (all) return runStationAction(card, STATION_ACTIONS.find((a) => a.key === 'start_recleaning'));
    const payload = taskPayload(card._model(), 'room', { rooms: rooms.map(Number), zones: [], spots: [], goto: null }, 1);
    return trackWrite(card, 'reclean:rooms', {
        label: translate(card._hass, 'aktNachreinigen'), failKey: 'aktionFehler',
        call: () => card._hass.callService(payload.domain, payload.service, Object.assign({ entity_id: card._opts.entity }, payload.data))
    });
}

function recleanConfirm(card, names, all, rooms) {
    return {
        title: translate(card._hass, 'aktNachreinigen') + '?',
        kind: 'confirm',
        render: (body, hass, dialog) => {
            body.appendChild(noteLine(translate(hass, all ? 'nachFrageAlle' : 'nachFrageTeil', { raeume: names.join(', ') })));
            const actions = document.createElement('div');
            actions.className = 'actions';
            const cancel = BuschUI.action({ label: translate(hass, 'abbrechen'), text: translate(hass, 'abbrechen'), onClick: () => dialog._goBack() });
            cancel.setAttribute('data-action', 'cancel');
            const go = BuschUI.action({ label: translate(hass, 'starten'), text: translate(hass, 'starten'), variant: 'primary', onClick: () => {
                runReclean(card, rooms, all);
                dialog._goBack();
            } });
            go.setAttribute('data-action', 'confirm');
            actions.append(cancel, go);
            body.appendChild(actions);
        }
    };
}

/** The "Nochmal reinigen" block of the newest run: room chips (≥ 1, none chosen at first), reason when locked. */
function recleanSection(card, hass, run, runs, load, detail, dialog) {
    const model = card._model();
    const mapId = card._map ? card._map.current().mapId : cameraAttrs(model).map_id;
    const state = recleanState(model, run, { newest: runs[0], load, mapId });
    if (!state.show) return null;
    if (!detail.reclean || detail.reclean.ts !== run.timestamp) detail.reclean = { ts: run.timestamp, chosen: new Set() };
    const chosen = detail.reclean.chosen;
    for (const id of [...chosen]) if (!state.rooms.includes(id)) chosen.delete(id);
    const rooms = cameraAttrs(model).rooms || {};
    const name = (id) => historyRoomName(hass, rooms, id);
    const section = document.createElement('div');
    section.className = 'history-reclean';
    const heading = document.createElement('h2');
    heading.className = 'settings-heading';
    heading.textContent = translate(hass, 'aktNachreinigen');
    const list = document.createElement('div');
    list.className = 'seq-chips';
    list.setAttribute('role', 'group');
    list.setAttribute('aria-label', translate(hass, 'nachRaeume'));
    for (const id of state.rooms) {
        const chip = BuschUI.action({ label: name(id), text: name(id), icon: (rooms[id] && rooms[id].icon) || 'mdi:floor-plan', onClick: () => {
            if (chosen.has(id)) chosen.delete(id);
            else chosen.add(id);
            dialog._render();
            const again = Array.from(dialog.shadowRoot.querySelectorAll('[data-reclean-room]')).find((n) => n.getAttribute('data-reclean-room') === id);
            if (again) again.focus();
        } });
        chip.setAttribute('data-reclean-room', id);
        chip.setAttribute('aria-pressed', String(chosen.has(id)));
        list.appendChild(chip);
    }
    section.append(heading, list);
    const picked = state.rooms.filter((id) => chosen.has(id));
    const all = picked.length === state.rooms.length;
    const busy = card._settingWrites.has('station:recleaning') || card._settingWrites.has('reclean:rooms');
    const label = translate(hass, 'aktNachreinigen');
    const button = BuschUI.action({ label: busy ? label + ' · ' + translate(hass, 'wirdGestartet') : label, text: busy ? translate(hass, 'wirdGestartet') : label,
        icon: 'mdi:refresh-circle', variant: 'primary', disabled: busy || !state.ok || !picked.length,
        onClick: () => dialog.show(recleanConfirm(card, picked.map(name), all, picked)) });
    button.setAttribute('data-action', 'reclean');
    if (busy) button.setAttribute('aria-busy', 'true');
    const why = !state.ok ? translate(hass, state.reason) : !picked.length ? translate(hass, 'nachWaehlen') : '';
    if (why) {
        const line = noteLine(why);
        line.setAttribute('data-note', 'reclean');
        section.appendChild(line);
    }
    const fail = card._settingNotes.get('station:recleaning') || card._settingNotes.get('reclean:rooms');
    if (fail) section.appendChild(noteLine(fail, 'error'));
    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.appendChild(button);
    section.appendChild(actions);
    return section;
}

/**
 * HIS-02/03: one run. Facts from the sensor at once, the map data's (counters,
 * start) as "—" until loaded; Older/Newer and ←/→ turn pages within the view
 * (back = the list, R05); the same view for cleaning and cruising (R08).
 */
function historyDetail(card, name, list, ts) {
    const kind = Object.assign({ name }, HISTORY_KINDS[name]);
    const detail = list.detail || (list.detail = { loads: new Map(), controller: null, canvases: new Map(), tab: 'cleaning', zoom: 1, failed: new Set() });
    let current = ts;
    let closing = false;
    const runAt = (hass) => historyRunsOf(card, kind, list, hass).find((r) => r.timestamp === current);
    const view = {
        get title() {
            return runDateText(card._hass, current);
        },
        kind: 'editor',
        watch: () => [card._model().entity(kind.sensor), historyCamera(card)].filter(Boolean),
        render: (body, hass, dialog) => {
            if (!closing) {
                closing = true;
                dialog.addEventListener('dialog-closed', () => abortRun(detail));
            }
            const redraw = () => { if (dialog._views[dialog._views.length - 1] === view) dialog._render(); };
            const runs = historyRunsOf(card, kind, list, hass);
            const index = runs.findIndex((r) => r.timestamp === current);
            const wrap = document.createElement('div');
            wrap.className = 'history-detail';
            body.appendChild(wrap);
            if (index < 0) {
                wrap.appendChild(noteLine(translate(hass, 'laufWeg')));
                return;
            }
            const run = runs[index];
            const load = loadRun(card, kind, run, detail, redraw);
            const go = (to, action) => {
                if (to < 0 || to >= runs.length) return;
                abortRun(detail);
                current = runs[to].timestamp;
                list.back = current;
                dialog._render();
                const again = action && dialog.shadowRoot.querySelector('[data-action="' + action + '"]');
                if (again && !again.disabled) again.focus();
            };
            wrap.addEventListener('keydown', (event) => {
                const to = { ArrowLeft: index - 1, ArrowRight: index + 1 }[event.key];
                if (to === undefined) return;
                event.preventDefault();
                go(to);
            });

            const head = document.createElement('p');
            head.className = 'history-head';
            const status = integrationState(hass, 'status', run.entry.status);
            head.appendChild(runStatus(hass, run.level));
            if (status) {
                const word = document.createElement('span');
                word.className = 'history-state';
                word.textContent = status;
                head.appendChild(word);
            }
            wrap.appendChild(head);

            const pager = document.createElement('div');
            pager.className = 'actions history-pager';
            const newer = BuschUI.action({ label: translate(hass, 'neuer'), text: translate(hass, 'neuer'), icon: 'mdi:chevron-left', disabled: index === 0, onClick: () => go(index - 1, 'newer') });
            newer.setAttribute('data-action', 'newer');
            const older = BuschUI.action({ label: translate(hass, 'aelter'), text: translate(hass, 'aelter'), icon: 'mdi:chevron-right', disabled: index === runs.length - 1, onClick: () => go(index + 1, 'older') });
            older.setAttribute('data-action', 'older');
            pager.append(newer, older);

            const facts = document.createElement('dl');
            facts.className = 'history-facts';
            for (const [key, label, text, fromData] of runFactRows(hass, kind, run, load)) {
                if (!fromData && !text) continue;
                const dt = document.createElement('dt');
                dt.textContent = translate(hass, label);
                const dd = document.createElement('dd');
                dd.setAttribute('data-fact', key);
                dd.textContent = text || '—';
                if (fromData && load.status === 'loading') dd.setAttribute('aria-busy', 'true');
                facts.append(dt, dd);
            }
            wrap.appendChild(facts);
            const note = runLoadNote(hass, load, () => {
                detail.loads.delete(current);
                dialog._render();
            });
            if (note) wrap.appendChild(note);

            const blocked = blockedRooms(run, load);
            if (blocked.size) {
                const rooms = cameraAttrs(card._model()).rooms || {};
                const heading = document.createElement('h2');
                heading.className = 'settings-heading';
                heading.textContent = translate(hass, 'blockierteRaeume');
                const ul = document.createElement('ul');
                ul.className = 'history-blocked';
                for (const [id, reason] of blocked) {
                    const li = document.createElement('li');
                    li.setAttribute('data-room', id);
                    li.textContent = [historyRoomName(hass, rooms, id), reason].filter(Boolean).join(' · ');
                    ul.appendChild(li);
                }
                wrap.append(heading, ul);
            }
            const map = runMapSection(card, hass, kind, run, load, detail, dialog);
            if (map) wrap.appendChild(map);
            const reclean = kind.cruising ? null : recleanSection(card, hass, run, runs, load, detail, dialog);
            if (reclean) wrap.appendChild(reclean);
            wrap.appendChild(pager);
        }
    };
    return view;
}

const CARD_STYLES = BuschUI.cardStyles + `
:host {
    display: block;
    container-type: inline-size;
}
.map-slot,
.map-view,
.map {
    display: flex;
    flex-direction: column;
    gap: var(--ha-space-2, 8px);
    min-width: 0;
    min-height: 0;
}
.map {
    border-radius: var(--ha-card-border-radius, 12px);
}
/* A normal card scrolls; the map keeps its size instead of being squeezed by long messages. */
.map-slot {
    flex-shrink: 0;
}
.map:focus-visible {
    outline: 2px solid var(--primary-color, #03a9f4);
    outline-offset: 2px;
}
.map-stage {
    position: relative;
    overflow: hidden;
    width: 100%;
    aspect-ratio: var(--bvc-map-aspect, 4 / 3);
    max-height: 60vh;
    border-radius: var(--ha-card-border-radius, 12px);
    background: var(--secondary-background-color, #eeeeee);
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
}
/* Locked (CORE-14): the page scrolls through the map, no gesture reaches it. */
:host([data-locked=true]) .map-stage {
    touch-action: pan-y;
}
:host([data-layout=panel]) .map-slot,
:host([data-layout=full]) .map-slot,
:host([data-layout=panel]) .map-view,
:host([data-layout=full]) .map-view,
:host([data-layout=panel]) .map,
:host([data-layout=full]) .map {
    flex: 1 1 0;
}
:host([data-layout=panel]) .map-stage,
:host([data-layout=full]) .map-stage {
    flex: 1 1 0;
    aspect-ratio: auto;
    max-height: none;
    min-height: 200px;
}
.map {
    position: relative;
}
.map-pan {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: 0 0;
    will-change: transform;
}
/* Buttons, keys, double tap and room chips tween; fingers, wheel and new map data move it directly. */
.map-view[data-animate] .map-pan {
    transition: transform 0.2s ease-out;
}
/* Animations hidden (CORE-18) or reduced motion: no tween. */
.map-view[data-gesture] .map-pan,
.map-view[data-still] .map-pan {
    transition: none;
}
@media (prefers-reduced-motion: reduce) {
    /* As specific as the animate rule, or it would lose (found in the browser run). */
    .map-view[data-animate] .map-pan { transition: none; }
}
.map-tools {
    position: absolute;
    right: var(--ha-space-2, 8px);
    bottom: var(--ha-space-2, 8px);
    display: flex;
    flex-direction: column;
    gap: var(--ha-space-1, 4px);
}
:host([data-hand=left]) .map-bubble {
    left: 68px;
    right: var(--ha-space-2, 8px);
}
:host([data-hand=left]) .map-tools {
    right: auto;
    left: var(--ha-space-2, 8px);
}
.map-tool {
    padding: 0;
    background: var(--ha-card-background, var(--card-background-color, #ffffff));
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}
.map-bubble {
    position: absolute;
    /* Across the map left of the zoom buttons' column; only its height follows the symbol. */
    left: var(--ha-space-2, 8px);
    right: 68px;
    top: 0;
    z-index: 3;
    display: flex;
    align-items: center;
    gap: var(--ha-space-1, 4px);
    padding: var(--ha-space-1, 4px) var(--ha-space-1, 4px) var(--ha-space-1, 4px) var(--ha-space-3, 12px);
    box-sizing: border-box;
    border-radius: var(--ha-card-border-radius, 12px);
    background: var(--ha-card-background, var(--card-background-color, #ffffff));
    color: var(--primary-text-color, #212121);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    transform: translateY(calc(var(--bvc-bubble-y, 0px) - 100% - 16px));
}
.map-bubble[data-below] {
    transform: translateY(calc(var(--bvc-bubble-y, 0px) + 16px));
}
.map-bubble-text {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    font-size: var(--ha-font-size-s, 14px);
}
.map-bubble-line {
    overflow-wrap: anywhere;
}
.map-bubble .busch-ui-action {
    flex: none;
}
.map-loupe {
    position: absolute;
    left: 0;
    top: 0;
    width: 120px;
    height: 120px;
    overflow: hidden;
    border-radius: 50%;
    border: 2px solid var(--primary-color, #03a9f4);
    background: var(--secondary-background-color, #eeeeee);
    pointer-events: none;
    z-index: 2;
}
.map-loupe-content {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: 0 0;
}
.map-loupe-content > * {
    width: 100%;
    height: 100%;
}
.map-background,
.map-overlay {
    position: absolute;
    pointer-events: none;
}
canvas.map-base {
    image-rendering: pixelated;
}
/* Image mode can only grey the integration's picture (R24 exception, docs/entwicklung.md). */
.map-view[data-scheme=grey][data-mode-image] .map-base {
    filter: grayscale(1);
}
.map-layers foreignObject.material {
    overflow: visible;
}
.material-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--ha-card-background, var(--card-background-color, #ffffff));
    color: var(--primary-text-color, #212121);
    --mdc-icon-size: 18px;
}
[data-symbol=robot] .material-icon {
    background: var(--bvc-map-robot, var(--primary-color, #03a9f4));
    color: var(--text-primary-color, #ffffff);
}
.map-base {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
}
.map-layers {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
}
/* Map colours (MAP-05/09): defaults here, colour scheme and override_colors set them inline on .map-view. */
.map-view {
    --bvc-map-path: var(--secondary-text-color, #727272);
    --bvc-map-carpet: var(--secondary-text-color, #727272);
    --bvc-map-furniture: var(--secondary-text-color, #727272);
    --bvc-map-no-go: var(--bvc-error-color, var(--error-color, #db4437));
    --bvc-map-no-mop: var(--info-color, #039be5);
    --bvc-map-wall: var(--primary-text-color, #212121);
    --bvc-map-virtual-wall: var(--bvc-error-color, var(--error-color, #db4437));
    --bvc-map-robot: var(--primary-color, #03a9f4);
    --bvc-map-charger: var(--bvc-success-color, var(--success-color, #43a047));
}
/* Layers (MAP-03): lines keep their screen width; colours from --bvc-map-*. */
.map-layers [data-object] {
    vector-effect: non-scaling-stroke;
    stroke-linejoin: round;
    stroke-linecap: round;
}
.map-layers polygon,
.map-layers line,
.map-layers polyline {
    fill: none;
    stroke-width: 2px;
}
[data-layer=path] [data-object] {
    stroke: var(--bvc-map-path, var(--secondary-text-color, #727272));
    stroke-width: 1px;
    opacity: 0.7;
}
[data-layer=path] [data-kind="2"] {
    stroke-dasharray: 3 2;
}
[data-layer=carpets] [data-object] {
    stroke: var(--bvc-map-carpet, var(--secondary-text-color, #727272));
    stroke-dasharray: 1 3;
    stroke-width: 2px;
}
[data-layer=detected_carpets] [data-object] {
    stroke: var(--bvc-map-carpet, var(--secondary-text-color, #727272));
    stroke-dasharray: 1 6;
    stroke-width: 1px;
}
[data-layer=deleted_carpets] [data-object] {
    stroke: var(--bvc-map-carpet, var(--secondary-text-color, #727272));
    stroke-dasharray: 8 4 1 4;
    stroke-width: 1px;
    opacity: 0.6;
}
[data-layer=furnitures] [data-object] {
    stroke: var(--bvc-map-furniture, var(--secondary-text-color, #727272));
    fill: var(--bvc-map-furniture, var(--secondary-text-color, #727272));
    fill-opacity: 0.2;
}
[data-layer=no_go_areas] [data-object] {
    stroke: var(--bvc-map-no-go, var(--bvc-error-color, var(--error-color, #db4437)));
    fill: var(--bvc-map-no-go, var(--bvc-error-color, var(--error-color, #db4437)));
    fill-opacity: 0.25;
    stroke-width: 2px;
}
[data-layer=no_mopping_areas] [data-object] {
    stroke: var(--bvc-map-no-mop, var(--info-color, #039be5));
    fill: var(--bvc-map-no-mop, var(--info-color, #039be5));
    fill-opacity: 0.2;
    stroke-dasharray: 6 3;
    stroke-width: 2px;
}
[data-layer=ramps] [data-object] {
    stroke: var(--bvc-map-wall, var(--primary-text-color, #212121));
    stroke-dasharray: 2 2;
}
[data-layer=curtains] [data-object] {
    stroke: var(--bvc-map-wall, var(--primary-text-color, #212121));
    stroke-dasharray: 10 2 2 2;
}
[data-layer=virtual_walls] [data-object] {
    stroke: var(--bvc-map-virtual-wall, var(--bvc-error-color, var(--error-color, #db4437)));
    stroke-width: 4px;
}
[data-layer=passable_thresholds] [data-object] {
    stroke: var(--bvc-map-wall, var(--primary-text-color, #212121));
    stroke-dasharray: 4 4;
    stroke-width: 3px;
}
[data-layer=impassable_thresholds] [data-object] {
    stroke: var(--bvc-map-virtual-wall, var(--bvc-error-color, var(--error-color, #db4437)));
    stroke-dasharray: 12 3;
    stroke-width: 5px;
}
.map-layers text {
    fill: var(--primary-text-color, #212121);
    paint-order: stroke;
    stroke: var(--ha-card-background, var(--card-background-color, #ffffff));
    stroke-width: 3px;
    font-family: inherit;
}
.map-layers .badge circle {
    fill: var(--bvc-accent-color, var(--primary-color, #03a9f4));
}
.map-layers .badge text {
    fill: var(--text-primary-color, #ffffff);
    stroke: none;
}
.map-layers [data-symbol] .body {
    fill: var(--ha-card-background, var(--card-background-color, #ffffff));
    stroke: var(--primary-text-color, #212121);
    stroke-width: 1.5px;
}
.map-layers [data-symbol] .mark,
.map-layers [data-symbol] .dot {
    fill: none;
    stroke: var(--primary-text-color, #212121);
    stroke-width: 2px;
}
.map-layers [data-symbol] .dot {
    fill: var(--primary-text-color, #212121);
}
.map-layers [data-symbol=robot] .body {
    fill: var(--bvc-map-robot, var(--primary-color, #03a9f4));
    stroke: var(--text-primary-color, #ffffff);
}
.map-layers [data-symbol=robot] .mark {
    fill: var(--text-primary-color, #ffffff);
    stroke: none;
}
.map-layers [data-symbol=robot] .ring {
    fill: none;
    stroke: var(--bvc-map-robot, var(--primary-color, #03a9f4));
    stroke-width: 2px;
    opacity: 0;
}
/* Robot state as ring shape, not only colour (R17): cleaning dashed, returning dotted, error solid red. */
.map-layers [data-symbol=robot][data-state=cleaning] .ring {
    opacity: 1;
    stroke-dasharray: 4 3;
}
.map-layers [data-symbol=robot][data-state=returning] .ring {
    opacity: 1;
    stroke-dasharray: 1 3;
}
.map-layers [data-symbol=robot][data-state=error] .ring {
    opacity: 1;
    stroke: var(--bvc-error-color, var(--error-color, #db4437));
}
.map-layers [data-symbol=charger] .body {
    fill: var(--bvc-map-charger, var(--bvc-success-color, var(--success-color, #43a047)));
    stroke: var(--text-primary-color, #ffffff);
}
.map-layers [data-symbol=charger] .mark {
    stroke: var(--text-primary-color, #ffffff);
}
.map-layers [data-symbol=obstacle] .body,
.map-layers [data-symbol=station] .body {
    fill: var(--bvc-warning-color, var(--warning-color, #ffa600));
}
.map-layers [data-symbol=station][data-level=error] .body {
    fill: var(--bvc-error-color, var(--error-color, #db4437));
}
/* clean-tasks: running targets dashed (R17: shape, not only colour), own selection solid. */
.map-view {
    --bvc-task-color: var(--bvc-accent-color, var(--primary-color, #03a9f4));
    --bvc-task-invalid: var(--bvc-error-color, var(--error-color, #db4437));
}
[data-layer=tasks] [data-select] circle {
    fill: var(--bvc-task-color, var(--primary-color, #03a9f4));
    stroke: var(--text-primary-color, #ffffff);
    stroke-width: 2px;
}
[data-layer=tasks] [data-select] text {
    fill: var(--text-primary-color, #ffffff);
    stroke: none;
    font-weight: var(--ha-font-weight-bold, 700);
}
[data-layer=tasks] polygon[data-select] {
    stroke: var(--bvc-task-color, var(--primary-color, #03a9f4));
    fill: var(--bvc-task-color, var(--primary-color, #03a9f4));
    fill-opacity: 0.18;
    stroke-width: 2px;
}
[data-layer=tasks] polygon[data-chosen=true] {
    stroke-width: 3px;
    fill-opacity: 0.3;
}
/* Outside the floor: red and dotted, plus "!" and the word in the list (R17). */
[data-layer=tasks] polygon[data-invalid=true] {
    stroke: var(--bvc-task-invalid, var(--error-color, #db4437));
    fill: var(--bvc-task-invalid, var(--error-color, #db4437));
    stroke-dasharray: 2 4;
}
[data-layer=tasks] [data-handle] circle {
    fill: var(--ha-card-background, var(--card-background-color, #ffffff));
    stroke: var(--bvc-task-color, var(--primary-color, #03a9f4));
    stroke-width: 2px;
}
[data-layer=tasks] [data-select=goto] path {
    fill: var(--bvc-task-color, var(--primary-color, #03a9f4));
    stroke: var(--text-primary-color, #ffffff);
    stroke-width: 1.5px;
}
[data-layer=tasks] [data-select=goto] circle {
    fill: var(--text-primary-color, #ffffff);
    stroke: none;
}
[data-layer=tasks] [data-handle=point] text {
    fill: var(--primary-text-color, #212121);
    stroke: none;
}
[data-layer=tasks] [data-handle=remove] path {
    stroke: var(--primary-text-color, #212121);
    stroke-width: 2px;
}
[data-layer=tasks] [data-active] {
    stroke: var(--bvc-task-color, var(--primary-color, #03a9f4));
    fill: var(--bvc-task-color, var(--primary-color, #03a9f4));
    fill-opacity: 0.2;
    stroke-width: 2px;
    stroke-dasharray: 6 3;
}
.map-layers [data-ignored=true] {
    opacity: 0.45;
}
.room-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ha-space-1, 4px);
    min-width: 0;
}
.room-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--ha-space-1, 4px);
    max-width: 100%;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.room-chip ha-icon {
    order: -1;
    flex: none;
    --mdc-icon-size: 18px;
}
.room-chip[aria-pressed=true] {
    background: var(--bvc-accent-color, var(--primary-color, #03a9f4));
    color: var(--text-primary-color, #ffffff);
}
.room-order {
    flex: none;
    min-width: 20px;
    padding: 0 var(--ha-space-1, 4px);
    box-sizing: border-box;
    border-radius: 999px;
    background: var(--bvc-accent-color, var(--primary-color, #03a9f4));
    color: var(--text-primary-color, #ffffff);
    font-size: var(--ha-font-size-s, 12px);
    text-align: center;
}
.room-chip[aria-pressed=true] .room-order {
    background: var(--text-primary-color, #ffffff);
    color: var(--bvc-accent-color, var(--primary-color, #03a9f4));
}
.map-layers [data-highlight] text[data-role=name] {
    font-weight: var(--ha-font-weight-bold, 700);
    text-decoration: underline;
}
.map-notes {
    display: flex;
    flex-direction: column;
    gap: var(--ha-space-1, 4px);
}
.map-notes:empty {
    display: none;
}
.map-note {
    display: flex;
    align-items: center;
    gap: var(--ha-space-2, 8px);
    color: var(--secondary-text-color, #727272);
    font-size: var(--ha-font-size-s, 14px);
    min-width: 0;
}
.map-note > span {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
}
.map-note > ha-icon {
    flex: none;
    --mdc-icon-size: 18px;
}
.map-note[data-kind=error] > ha-icon,
.map-note[data-kind=unavailable] > ha-icon {
    color: var(--bvc-error-color, var(--error-color, #db4437));
}
/* hidden_card_objects: a hidden part never shows, whatever display its class sets. */
[hidden] {
    display: none !important;
}
ha-card {
    overflow-x: hidden;
    overflow-y: auto;
    /* CORE-13: a normal card never grows past the visible view. */
    max-height: calc(100dvh - var(--bvc-header-height, 56px) - var(--bvc-height-offset, 0px));
    padding: var(--ha-space-4, 16px);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--ha-space-3, 12px);
}
.error {
    display: flex;
    align-items: flex-start;
    gap: var(--ha-space-3, 12px);
    color: var(--bvc-error-color, var(--error-color, #db4437));
    font-size: var(--ha-font-size-s, 14px);
    overflow-wrap: anywhere;
}
:host([data-layout=panel]) {
    height: 100%;
}
:host([data-layout=panel]) ha-card {
    height: 100%;
    max-height: none;
    border-radius: 0;
    border: none;
    box-shadow: none;
}
:host([data-layout=full]) ha-card {
    height: calc(100dvh - var(--bvc-header-height, 56px) - var(--bvc-height-offset, 0px));
}
:host([data-aspect]) ha-card {
    aspect-ratio: var(--bvc-aspect-ratio);
}
.top {
    display: flex;
    align-items: flex-start;
    gap: var(--ha-space-2, 8px);
    min-width: 0;
}
.head {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
}
.menu-button {
    flex: none;
}
.menu-button[hidden] {
    display: none;
}
.title {
    margin: 0;
    font-size: var(--ha-font-size-l, 20px);
    font-weight: var(--ha-font-weight-medium, 500);
    color: var(--primary-text-color, #212121);
}
.state {
    color: var(--secondary-text-color, #727272);
    font-size: var(--ha-font-size-s, 14px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
}
.stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
    gap: var(--ha-space-2, 8px);
}
.stats:empty {
    display: none;
}
.metric {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    column-gap: var(--ha-space-1, 4px);
    min-width: 0;
}
.metric ha-icon {
    grid-column: 1;
    grid-row: 1 / span 2;
    --mdc-icon-size: 20px;
}
.metric-label,
.metric-value {
    grid-column: 2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
}
.metric-label {
    color: var(--secondary-text-color, #727272);
    font-size: var(--ha-font-size-s, 12px);
}
.metric[data-battery=charging] ha-icon {
    color: var(--bvc-success-color, var(--success-color, #43a047));
}
.metric[data-battery=paused] ha-icon {
    color: var(--bvc-warning-color, var(--warning-color, #ffa600));
}
.metric[data-battery=low] ha-icon,
.metric[data-battery=low] .metric-value {
    color: var(--bvc-error-color, var(--error-color, #db4437));
}
.controls {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ha-space-2, 8px);
    align-items: center;
}
.controls:empty {
    display: none;
}
.ctl ha-icon {
    order: -1;
}
.ctl {
    display: inline-flex;
    align-items: center;
    gap: var(--ha-space-1, 4px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
}
.controls {
    justify-content: flex-end;
}
/* CORE-08: action buttons right, the station status left; left-handed mirrors it. */
.dock {
    order: -1;
    margin-inline-end: auto;
}
:host([data-hand=left]) .controls {
    justify-content: flex-start;
}
:host([data-hand=left]) .dock {
    order: 1;
    margin-inline-end: 0;
    margin-inline-start: auto;
}
.lock[hidden] {
    display: none;
}
.lock {
    flex: none;
}
.dock {
    display: inline-flex;
    align-items: center;
    gap: var(--ha-space-1, 4px);
    min-height: 44px;
    min-width: 0;
    padding: 0 var(--ha-space-3, 12px);
    box-sizing: border-box;
    border: 1px solid var(--divider-color, #e0e0e0);
    border-radius: var(--ha-card-border-radius, 12px);
    color: var(--secondary-text-color, #727272);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.dock span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
}
.dock[data-dock=warning] {
    border-color: var(--bvc-warning-color, var(--warning-color, #ffa600));
    color: var(--bvc-warning-color, var(--warning-color, #ffa600));
}
.dock[data-dock=error] {
    border-color: var(--bvc-error-color, var(--error-color, #db4437));
    color: var(--bvc-error-color, var(--error-color, #db4437));
}
.progress {
    display: block;
    height: 4px;
    margin: calc(-1 * var(--ha-space-4, 16px)) calc(-1 * var(--ha-space-4, 16px)) 0;
    width: calc(100% + 2 * var(--ha-space-4, 16px));
    border: 0;
    appearance: none;
    background: var(--divider-color, #e0e0e0);
    accent-color: var(--bvc-accent-color, var(--primary-color, #03a9f4));
}
.progress::-webkit-progress-bar {
    background: var(--divider-color, #e0e0e0);
}
.progress::-webkit-progress-value {
    background: var(--bvc-accent-color, var(--primary-color, #03a9f4));
}
.progress::-moz-progress-bar {
    background: var(--bvc-accent-color, var(--primary-color, #03a9f4));
}
.messages {
    display: flex;
    flex-direction: column;
    gap: var(--ha-space-2, 8px);
}
.messages:empty,
.task-area:empty {
    display: none;
}
.message {
    display: flex;
    align-items: center;
    gap: var(--ha-space-2, 8px);
    padding: var(--ha-space-1, 4px) var(--ha-space-1, 4px) var(--ha-space-1, 4px) var(--ha-space-3, 12px);
    border-inline-start: 4px solid var(--bvc-info-color, var(--info-color, #039be5));
    border-radius: var(--ha-card-border-radius, 12px);
    background: var(--secondary-background-color, #eeeeee);
    min-width: 0;
}
.message[data-kind=error] {
    border-color: var(--bvc-error-color, var(--error-color, #db4437));
}
.message[data-kind=warning],
.message[data-kind=low_water] {
    border-color: var(--bvc-warning-color, var(--warning-color, #ffa600));
}
.message > ha-icon {
    flex: none;
}
.message[data-kind=error] > ha-icon {
    color: var(--bvc-error-color, var(--error-color, #db4437));
}
.message[data-kind=warning] > ha-icon,
.message[data-kind=low_water] > ha-icon {
    color: var(--bvc-warning-color, var(--warning-color, #ffa600));
}
.message-text {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
}
/* The level word on a line of its own: inline, the wrapped text's box would cover it. */
.message-text strong {
    display: block;
}
.task-area {
    display: flex;
    flex-direction: column;
    gap: var(--ha-space-2, 8px);
}
.task-head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--ha-space-1, 4px);
}
.tasks {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ha-space-1, 4px);
    /* Narrow cards put the settings button on its own line instead of squeezing the types. */
    flex: 1 1 22em;
    min-width: 0;
}
.task-settings {
    flex: none;
    margin-inline-start: auto;
    display: inline-flex;
    align-items: center;
    gap: var(--ha-space-1, 4px);
}
.task-settings ha-icon {
    order: -1;
    --mdc-icon-size: 20px;
}
.task {
    display: inline-flex;
    align-items: center;
    gap: var(--ha-space-1, 4px);
    /* Content width as basis: on a phone the five types wrap instead of clipping icon and word. */
    flex: 1 1 auto;
    justify-content: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
}
.task ha-icon {
    order: -1;
    --mdc-icon-size: 20px;
}
.task[aria-checked=true] {
    background: var(--bvc-accent-color, var(--primary-color, #03a9f4));
    color: var(--text-primary-color, #ffffff);
}
.task-hint,
.task-badge {
    display: flex;
    align-items: center;
    gap: var(--ha-space-1, 4px);
    color: var(--secondary-text-color, #727272);
    font-size: var(--ha-font-size-s, 14px);
    overflow-wrap: anywhere;
}
.task-badge ha-icon,
.task-hint ha-icon,
.task-error ha-icon {
    flex: none;
    --mdc-icon-size: 18px;
}
.task-tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ha-space-1, 4px);
}
.task-count {
    flex: 1 1 100%;
    color: var(--secondary-text-color, #727272);
    font-size: var(--ha-font-size-s, 14px);
}
.task-repeats .task-count {
    flex: 1 1 auto;
}
.task-tools .busch-ui-action {
    display: inline-flex;
    align-items: center;
    gap: var(--ha-space-1, 4px);
}
.task-tools ha-icon,
.task-note ha-icon {
    order: -1;
    flex: none;
    --mdc-icon-size: 18px;
}
.task-list,
.task-edit {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ha-space-1, 4px);
    min-width: 0;
}
.task-item {
    display: inline-flex;
    align-items: center;
    gap: var(--ha-space-1, 4px);
    max-width: 100%;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.task-item ha-icon,
.task-edit ha-icon {
    order: -1;
    flex: none;
    --mdc-icon-size: 18px;
}
.task-item[aria-pressed=true] {
    background: var(--bvc-accent-color, var(--primary-color, #03a9f4));
    color: var(--text-primary-color, #ffffff);
}
.task-edit .busch-ui-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--ha-space-1, 4px);
}
.task-note {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ha-space-1, 4px);
    color: var(--secondary-text-color, #727272);
    font-size: var(--ha-font-size-s, 14px);
    overflow-wrap: anywhere;
}
.task-note > span {
    flex: 1;
    min-width: 0;
}
.task-bubble {
    position: absolute;
    left: var(--ha-space-2, 8px);
    right: 68px;
    bottom: var(--ha-space-2, 8px);
    z-index: 3;
    display: flex;
    align-items: center;
    gap: var(--ha-space-1, 4px);
    padding: var(--ha-space-1, 4px) var(--ha-space-1, 4px) var(--ha-space-1, 4px) var(--ha-space-3, 12px);
    box-sizing: border-box;
    border-radius: var(--ha-card-border-radius, 12px);
    background: var(--ha-card-background, var(--card-background-color, #ffffff));
    color: var(--primary-text-color, #212121);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}
:host([data-hand=left]) .task-bubble {
    left: 68px;
    right: var(--ha-space-2, 8px);
}
.task-bubble-text {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
    font-size: var(--ha-font-size-s, 14px);
}
.task-bubble .busch-ui-action {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: var(--ha-space-1, 4px);
}
.task-bubble ha-icon {
    order: -1;
    --mdc-icon-size: 18px;
}
.task-error {
    display: flex;
    align-items: center;
    gap: var(--ha-space-1, 4px);
    padding: var(--ha-space-1, 4px) var(--ha-space-2, 8px);
    border-inline-start: 4px solid var(--bvc-error-color, var(--error-color, #db4437));
    border-radius: var(--ha-card-border-radius, 12px);
    background: var(--secondary-background-color, #eeeeee);
    font-size: var(--ha-font-size-s, 14px);
    overflow-wrap: anywhere;
}
.task-error ha-icon {
    color: var(--bvc-error-color, var(--error-color, #db4437));
}
`;

const DIALOG_STYLES = BuschUI.cardStyles + `
:host {
    position: fixed;
    inset: 0;
    /* Above Leaflet's panes (400) and controls (1000): the dialog shares the page's stacking context. */
    z-index: 100000;
    display: flex;
    align-items: center;
    justify-content: center;
    /* The sheet's height comes from this fixed box, which follows the visible viewport. */
    box-sizing: border-box;
    padding: max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right))
        max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
}
.scrim {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    animation: fade 0.3s ease-out;
}
@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes rise { from { transform: translateY(32px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes grow { from { transform: scale(0.94); opacity: 0; } to { transform: none; opacity: 1; } }
.sheet {
    position: relative;
    width: min(560px, 100%);
    max-height: 100%;
    overscroll-behavior: contain;
    overflow-y: auto;
    overflow-x: hidden;
    background: var(--ha-card-background, var(--card-background-color, #ffffff));
    color: var(--primary-text-color, #212121);
    border-radius: 16px;
    padding: 16px;
    box-sizing: border-box;
    animation: grow 0.3s ease-out;
}
/* Phones: full screen (hacs/docs/ui-regeln.md, no floating dialog below 450 x 500 px). */
@media (max-width: 449.98px), (max-height: 499.98px) {
    :host {
        padding: env(safe-area-inset-top) env(safe-area-inset-right)
            env(safe-area-inset-bottom) env(safe-area-inset-left);
    }
    .sheet { width: 100%; height: 100%; border-radius: 0; animation-name: rise; }
    .head { border-radius: 0; }
}
@media (prefers-reduced-motion: reduce) {
    .scrim, .sheet { animation: none; }
}
/* hidden_card_objects: animations */
:host([data-still]) .scrim,
:host([data-still]) .sheet {
    animation: none;
}
/* Confirmations are narrow (hacs/docs/ui-regeln.md: 320 px), full screen on phones like any dialog. */
.sheet[data-kind=confirm] {
    width: min(320px, 100%);
}
@media (max-width: 449.98px), (max-height: 499.98px) {
    .sheet[data-kind=confirm] { width: 100%; }
}
.actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--ha-space-2, 8px);
    margin-top: var(--ha-space-4, 16px);
}
.actions .busch-ui-action {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
}
.head {
    display: flex;
    align-items: center;
    gap: var(--ha-space-2, 8px);
    /* Stays on top while the sheet scrolls, edge to edge over the sheet's padding. */
    position: sticky;
    top: -16px;
    z-index: 2;
    margin: -16px -16px 12px;
    padding: 16px;
    border-radius: 16px 16px 0 0;
    background: var(--ha-card-background, var(--card-background-color, #ffffff));
}
.head h1 {
    flex: 1;
    margin: 0;
    font-size: var(--ha-font-size-xl, 20px);
    font-weight: var(--ha-font-weight-medium, 500);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.head .busch-ui-action {
    flex: none;
}
.menu {
    display: flex;
    flex-direction: column;
    gap: var(--ha-space-1, 4px);
}
.menu-item {
    display: flex;
    align-items: center;
    gap: var(--ha-space-3, 12px);
    width: 100%;
    text-align: start;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
}
.menu-item ha-icon {
    order: -1;
    flex: none;
}
.badge {
    margin-inline-start: auto;
    flex: none;
    padding: 0 var(--ha-space-2, 8px);
    border-radius: 999px;
    background: var(--bvc-warning-color, var(--warning-color, #ffa600));
    color: var(--text-primary-color, #ffffff);
    font-size: var(--ha-font-size-s, 12px);
}
.placeholder {
    margin: 0;
    color: var(--secondary-text-color, #727272);
    overflow-wrap: anywhere;
}
.obstacle-facts,
.history-facts {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--ha-space-1, 4px) var(--ha-space-3, 12px);
    margin: 0;
}
.obstacle-facts dt,
.history-facts dt {
    color: var(--secondary-text-color, #727272);
    overflow-wrap: anywhere;
}
.obstacle-facts dd,
.history-facts dd {
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
}
.obstacle-photo {
    display: block;
    width: 100%;
    max-height: 50vh;
    object-fit: contain;
    margin-top: var(--ha-space-3, 12px);
    border-radius: var(--ha-card-border-radius, 12px);
    background: var(--secondary-background-color, #eeeeee);
}
.obstacle-note {
    margin-top: var(--ha-space-3, 12px);
    color: var(--secondary-text-color, #727272);
}
.obstacle-note p {
    margin: 0 0 var(--ha-space-1, 4px);
    overflow-wrap: anywhere;
}
.link-action {
    display: inline-flex;
    align-items: center;
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
}
.settings-search {
    width: 100%;
    max-width: none;
    margin-bottom: var(--ha-space-2, 8px);
}
.search-count {
    margin: 0 0 var(--ha-space-2, 8px);
    color: var(--secondary-text-color, #727272);
    overflow-wrap: anywhere;
}
.settings-list {
    display: flex;
    flex-direction: column;
}
.setting {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--ha-space-2, 8px) var(--ha-space-3, 12px);
    min-height: 44px;
    padding: var(--ha-space-2, 8px) 0;
    border-bottom: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
}
.setting-text {
    flex: 1 1 12em;
    min-width: 0;
    display: flex;
    flex-direction: column;
}
.setting-name {
    overflow-wrap: anywhere;
}
.setting-status {
    color: var(--secondary-text-color, #727272);
    font-size: var(--ha-font-size-s, 12px);
    overflow-wrap: anywhere;
}
.setting-status:empty {
    display: none;
}
.setting[data-state=error] .setting-status {
    color: var(--bvc-error-color, var(--error-color, #db4437));
}
.setting-switch {
    flex: none;
    min-width: 72px;
}
.setting-pair {
    display: flex;
    gap: var(--ha-space-2, 8px);
}
.setting-select,
.setting-input {
    flex: 0 1 14em;
    min-width: 0;
    max-width: 100%;
    min-height: 44px;
    box-sizing: border-box;
    padding: 0 var(--ha-space-2, 8px);
    border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
    border-radius: var(--ha-space-2, 8px);
    background: var(--card-background-color, #ffffff);
    color: var(--primary-text-color, #212121);
    font: inherit;
}
.setting-select:focus-visible,
.setting-input:focus-visible {
    outline: 2px solid var(--primary-color, #03a9f4);
    outline-offset: 2px;
}
.setting-select:disabled,
.setting-input:disabled {
    opacity: 0.5;
}
.field {
    display: flex;
    flex-direction: column;
    gap: var(--ha-space-1, 4px);
    margin-bottom: var(--ha-space-3, 12px);
}
.field .setting-input {
    flex: none;
    width: 100%;
}
.field-error {
    color: var(--bvc-error-color, var(--error-color, #db4437));
    font-size: var(--ha-font-size-s, 12px);
    overflow-wrap: anywhere;
}
.field-error:empty {
    display: none;
}
.form-note {
    margin: 0 0 var(--ha-space-3, 12px);
    color: var(--secondary-text-color, #727272);
    overflow-wrap: anywhere;
}
.form-note[data-kind=error] {
    color: var(--bvc-error-color, var(--error-color, #db4437));
}
.setting-value {
    flex: 0 1 auto;
    min-width: 0;
    text-align: end;
    overflow-wrap: anywhere;
}
.day-picker {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
}
/* Seven equal days in one row from 320 px on (7 x 44 px + gaps); narrower wraps evenly. */
.day-picker .busch-ui-action {
    flex: 1 1 0;
    min-width: 44px;
    padding-inline: 0;
}
.field-label {
    overflow-wrap: anywhere;
}
.station-status {
    list-style: none;
    margin: 0 0 var(--ha-space-3, 12px);
    padding: 0;
}
.station-status li {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--ha-space-1, 4px) var(--ha-space-2, 8px);
    min-height: 32px;
    padding: var(--ha-space-1, 4px) 0;
}
.station-status ha-icon {
    flex: none;
    color: var(--bvc-success-color, var(--success-color, #43a047));
}
.station-status .setting-name {
    flex: 1 1 10em;
    min-width: 0;
}
.station-status [data-level=info] ha-icon {
    color: var(--bvc-info-color, var(--info-color, #039be5));
}
.station-status [data-level=warning] ha-icon {
    color: var(--bvc-warning-color, var(--warning-color, #ffa600));
}
.station-status [data-level=error] ha-icon {
    color: var(--bvc-error-color, var(--error-color, #db4437));
}
.station-values {
    margin: 0 0 var(--ha-space-3, 12px);
}
/* Shortcut names come from the app and can be long: they wrap instead of being cut. */
.menu-item[data-shortcut],
.menu-item[data-room] {
    white-space: normal;
    overflow-wrap: anywhere;
}
.manage-start {
    flex: 1 1 10em;
    min-width: 0;
}
.actions [data-action=reload] {
    display: inline-flex;
    align-items: center;
    gap: var(--ha-space-2, 8px);
}
.actions [data-action=reload] ha-icon {
    order: -1;
}
.station-values summary {
    min-height: 44px;
    display: flex;
    align-items: center;
    cursor: pointer;
    color: var(--secondary-text-color, #727272);
}
.station-tabs {
    display: flex;
    gap: var(--ha-space-1, 4px);
    border-bottom: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
    padding-bottom: var(--ha-space-2, 8px);
}
.station-tabs .busch-ui-action {
    flex: 1 1 0;
    min-width: 0;
    min-height: 44px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.station-actions {
    margin-top: var(--ha-space-2, 8px);
}
.task-repeats {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ha-space-1, 4px);
    padding: var(--ha-space-2, 8px) 0;
}
.task-repeats .task-count {
    flex: 1 1 auto;
}
.repeats-hint {
    flex: 1 1 100%;
    color: var(--secondary-text-color, #727272);
    font-size: var(--ha-font-size-s, 14px);
}
.seq-list {
    display: flex;
    flex-direction: column;
    gap: var(--ha-space-1, 4px);
}
.seq-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ha-space-2, 8px);
    min-height: 44px;
    padding: 0 var(--ha-space-1, 4px);
    border-radius: var(--ha-border-radius-md, 8px);
    background: var(--secondary-background-color, #eeeeee);
}
.seq-row:focus-visible,
.seq-row[aria-selected=true] {
    outline: 2px solid var(--primary-color, #03a9f4);
    outline-offset: 1px;
}
.seq-row[data-dragging] {
    opacity: 0.6;
}
.seq-handle {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    cursor: grab;
    /* The grip alone takes the gesture; the list scrolls everywhere else (R06). */
    touch-action: none;
    color: var(--secondary-text-color, #727272);
}
.seq-pos {
    flex: none;
    min-width: 1.5em;
    font-weight: var(--ha-font-weight-medium, 500);
}
.seq-name {
    /* Whole words; the move buttons wrap below on a phone. */
    flex: 1 1 6em;
    min-width: 0;
    overflow-wrap: break-word;
}
.seq-chips .busch-ui-action,
.actions [data-action=apply-all],
.actions [data-action=tap-mode],
.form-note [data-action=undo],
.setting [data-action=add] {
    display: inline-flex;
    align-items: center;
    gap: var(--ha-space-2, 8px);
}
.actions [data-action=apply-all] ha-icon,
.actions [data-action=tap-mode] ha-icon,
.form-note [data-action=undo] ha-icon,
.setting [data-action=add] ha-icon,
.seq-chips ha-icon {
    order: -1;
}
.seq-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ha-space-1, 4px);
}
.seq-chips [aria-pressed=true] {
    background: var(--primary-color, #03a9f4);
    color: var(--text-primary-color, #ffffff);
}
.seq-live {
    margin: 0;
    min-height: 1.2em;
    color: var(--secondary-text-color, #727272);
    font-size: var(--ha-font-size-s, 14px);
}
.settings-heading {
    margin: var(--ha-space-4, 16px) 0 0;
    font-size: var(--ha-font-size-m, 14px);
    font-weight: var(--ha-font-weight-medium, 500);
    color: var(--secondary-text-color, #727272);
}
.floor-preview {
    flex: none;
    width: 56px;
    height: 40px;
    object-fit: contain;
    border-radius: var(--ha-space-1, 4px);
    background: var(--secondary-background-color, #eeeeee);
}
.floor-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.history-sums,
.history-empty {
    margin: 0 0 var(--ha-space-3, 12px);
    color: var(--secondary-text-color, #727272);
    overflow-wrap: anywhere;
}
.history-list,
.history-members {
    display: flex;
    flex-direction: column;
}
.history-members {
    padding-inline-start: var(--ha-space-6, 24px);
}
.history-run {
    display: flex;
    align-items: center;
    gap: var(--ha-space-3, 12px);
    width: 100%;
    min-height: 48px;
    padding: var(--ha-space-2, 8px) var(--ha-space-1, 4px);
    border: 0;
    border-bottom: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
    background: none;
    color: var(--primary-text-color, #212121);
    font: inherit;
    text-align: start;
    cursor: pointer;
}
.history-run:hover {
    background: var(--secondary-background-color, #f5f5f5);
}
.history-run:focus-visible {
    outline: 2px solid var(--primary-color, #03a9f4);
    outline-offset: -2px;
}
.history-run > ha-icon {
    flex: none;
}
.run-text {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
}
.run-title,
.run-meta {
    overflow-wrap: anywhere;
}
.run-meta {
    color: var(--secondary-text-color, #727272);
    font-size: var(--ha-font-size-s, 14px);
}
.run-status {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: var(--ha-space-1, 4px);
    font-size: var(--ha-font-size-s, 14px);
    color: var(--bvc-success-color, var(--success-color, #43a047));
}
.run-status[data-level=notice] {
    color: var(--bvc-warning-color, var(--warning-color, #ffa600));
}
.run-status[data-level=interrupted] {
    color: var(--bvc-error-color, var(--error-color, #db4437));
}
.run-status span {
    color: var(--primary-text-color, #212121);
}
.history-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ha-space-2, 8px);
    margin: 0 0 var(--ha-space-3, 12px);
}
.history-state {
    overflow-wrap: anywhere;
}
.history-detail .form-note {
    margin-top: var(--ha-space-3, 12px);
}
.history-detail [data-action=retry] {
    margin-inline-start: var(--ha-space-2, 8px);
}
.history-blocked {
    margin: var(--ha-space-2, 8px) 0 0;
    padding-inline-start: var(--ha-space-5, 20px);
}
.history-blocked li {
    overflow-wrap: anywhere;
}
.history-pager {
    margin-top: var(--ha-space-4, 16px);
}
.history-detail .busch-ui-action {
    display: inline-flex;
    align-items: center;
    gap: var(--ha-space-2, 8px);
}
.history-detail .busch-ui-action ha-icon {
    order: -1;
}
.history-detail [data-action=older] ha-icon {
    order: 1;
}
.history-pager .busch-ui-action {
    justify-content: center;
    flex: 1 1 0;
    min-width: 0;
    min-height: 44px;
}
.history-map {
    margin-top: var(--ha-space-3, 12px);
}
.history-map .station-tabs {
    margin-bottom: var(--ha-space-2, 8px);
}
.history-map-frame {
    overflow: auto;
    max-height: 60vh;
    border-radius: var(--ha-card-border-radius, 12px);
    background: var(--secondary-background-color, #eeeeee);
}
.history-map-stage {
    position: relative;
    min-width: 100%;
}
.history-map-canvas,
.history-map-img {
    display: block;
    width: 100%;
    height: auto;
    image-rendering: pixelated;
}
.history-map-overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
}
.history-map-overlay polyline {
    fill: none;
    stroke: var(--bvc-map-path, #5c6670);
    stroke-width: 0.6;
    stroke-linejoin: round;
    stroke-linecap: round;
}
.history-map-overlay rect {
    fill: var(--bvc-warning-color, var(--warning-color, #ffa600));
    stroke: var(--card-background-color, #ffffff);
    stroke-width: 0.5;
}
.history-zoom {
    display: flex;
    justify-content: flex-end;
    gap: var(--ha-space-1, 4px);
    margin-top: var(--ha-space-1, 4px);
}
`;

/**
 * The card's one dialog element (CORE-12), after BuschLightDialog of
 * Lightcards 0.11.0: full screen below 450 x 500 px, centred above; sticky
 * head; page scroll locked; Escape and the back gesture through history
 * entries of its own; focus trapped inside and handed back on close.
 *
 * Views stack: `show({ title, kind, watch, render })` opens one on top, back
 * returns to the one below. Only a transient `menu` closes from outside;
 * views and editors never do (R04).
 */
class BuschVacuumDialog extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._hass = null;
        this._views = [];
        this._sheet = null;
        this._depth = 0; // history entries pushed by this dialog; back consumes them
        this._closing = false;
        this._closed = false;
        this._returnFocus = null;
        this._seen = null;
        this._onKey = (event) => {
            if (event.key === 'Tab') {
                const controls = this._focusable();
                const index = controls.indexOf(this.shadowRoot.activeElement);
                if (!controls.length) { event.preventDefault(); this._sheet.focus(); return; }
                if (event.shiftKey && index <= 0) {
                    event.preventDefault(); controls[controls.length - 1].focus();
                } else if (!event.shiftKey && (index < 0 || index === controls.length - 1)) {
                    event.preventDefault(); controls[0].focus();
                }
                return;
            }
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            this._goBack();
        };
        this._onFocus = (event) => {
            if (this.isConnected && !event.composedPath().includes(this)) this._focusFirst();
        };
        this._onPop = () => {
            if (this._closing) {
                this._closing = false;
                this._dismiss();
                return;
            }
            if (this._views.length > 1) {
                const steps = Math.min(this._popSteps || 1, this._views.length - 1);
                this._popSteps = 0;
                this._depth = Math.max(0, this._depth - steps);
                this._leave(this._views.splice(-steps));
                this._render();
                return;
            }
            this._depth = 0;
            this._dismiss();
        };
    }

    set hass(hass) {
        const unchanged = snapshotUnchanged(this._seen, hass);
        this._hass = hass;
        if (!unchanged) this._render();
        // A view with `update` (remote) repaints itself in place on every hass.
        const view = this._views[this._views.length - 1];
        if (view && view.update && this._sheet) view.update(hass);
    }

    /** Views that leave the stack hear it first (remote stops before anything else happens). */
    _leave(views) {
        for (const view of views) if (view.leave) view.leave();
    }

    get hass() {
        return this._hass;
    }

    /** Opens a view on top of the current one, with a history entry of its own once open. */
    show(view) {
        this._views.push(view);
        if (this.isConnected) this._push();
        this._render();
        this._focusFirst();
    }

    connectedCallback() {
        let active = document.activeElement;
        while (active && active.shadowRoot && active.shadowRoot.activeElement) active = active.shadowRoot.activeElement;
        this._returnFocus = active;
        document.addEventListener('keydown', this._onKey);
        document.addEventListener('focusin', this._onFocus, true);
        window.addEventListener('popstate', this._onPop);
        // The dashboard behind must not scroll along with the sheet.
        const page = document.documentElement.style;
        this._pageOverflow = page.overflow;
        page.overflow = 'hidden';
        // The phone's back gesture is a history navigation: without an entry of
        // its own it would leave the dashboard instead of closing the dialog.
        this._push();
        this._focusFirst();
    }

    disconnectedCallback() {
        document.removeEventListener('keydown', this._onKey);
        document.removeEventListener('focusin', this._onFocus, true);
        window.removeEventListener('popstate', this._onPop);
        document.documentElement.style.overflow = this._pageOverflow || '';
        if (this._returnFocus && this._returnFocus.isConnected) this._returnFocus.focus();
    }

    _push() {
        try {
            history.pushState({ [DIALOG_HISTORY_KEY]: this._depth + 1 }, '', location.href);
            this._depth += 1;
        } catch (e) {
            // Private modes can refuse this; Escape and the close button still work.
        }
    }

    /** Escape and the back arrow: one view back, out only from the first. */
    _goBack() {
        if (this._views.length > 1) {
            this._leave(this._views.slice(-1));
            if (this._depth > 1) {
                history.back(); // popstate returns to the view below
                return;
            }
            this._views.pop();
            this._render();
            return;
        }
        this.close();
    }

    /** Several views back at once (a saved form and its confirmation), through history like _goBack. */
    back(steps) {
        const n = Math.min(steps, this._views.length - 1);
        if (n < 1) return;
        this._leave(this._views.slice(-n));
        if (this._depth > n) {
            this._popSteps = n;
            history.go(-n); // one popstate returns n views
            return;
        }
        this._views.splice(-n);
        this._render();
    }

    close() {
        this._leave(this._views);
        if (this._depth > 0) {
            const steps = this._depth;
            this._depth = 0;
            this._closing = true;
            history.go(-steps);
            // Insurance: if popstate never arrives, the dialog must not stay open.
            setTimeout(() => { if (this.isConnected) this._dismiss(); }, 300);
            return;
        }
        this._dismiss();
    }

    _dismiss() {
        if (this._closed) return;
        this._closed = true;
        this._leave(this._views);
        this.dispatchEvent(new CustomEvent('dialog-closed'));
        this.remove();
    }

    _build() {
        const root = this.shadowRoot;
        const style = document.createElement('style');
        style.textContent = DIALOG_STYLES;
        const scrim = document.createElement('div');
        scrim.className = 'scrim';
        scrim.addEventListener('click', () => {
            const view = this._views[this._views.length - 1];
            if (view && view.kind === 'menu') this.close();
        });
        this._sheet = document.createElement('div');
        this._sheet.className = 'sheet';
        this._sheet.setAttribute('role', 'dialog');
        this._sheet.setAttribute('aria-modal', 'true');
        this._sheet.setAttribute('aria-labelledby', 'vacuum-dialog-title');
        this._sheet.tabIndex = -1;
        root.append(style, scrim, this._sheet);
    }

    _focusable() {
        if (!this._sheet) return [];
        return Array.from(this._sheet.querySelectorAll('button, input, select, textarea, [tabindex]'))
            .filter((node) => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length);
    }

    _focusFirst() {
        if (!this._sheet || !this.isConnected) return;
        (this._focusable()[0] || this._sheet).focus();
    }

    _render() {
        const hass = this._hass;
        const view = this._views[this._views.length - 1];
        if (!hass || !view) return;
        if (!this._sheet) this._build();
        this._seen = watchSnapshot(hass, view.watch ? view.watch() : []);
        const focused = this._focusable().indexOf(this.shadowRoot.activeElement);
        const scrollTop = this._sheet.scrollTop;
        this._sheet.setAttribute('data-kind', view.kind);

        const head = document.createElement('div');
        head.className = 'head';
        if (this._views.length > 1) head.appendChild(this._headButton('back', 'mdi:arrow-left', 'zurueck', () => this._goBack()));
        // Rule 2, anatomy: the close X sits top left, ahead of the title.
        head.appendChild(this._headButton('close', 'mdi:close', 'schliessen', () => this.close()));
        const title = document.createElement('h1');
        title.id = 'vacuum-dialog-title';
        title.textContent = view.title;
        head.appendChild(title);
        const body = document.createElement('div');
        body.className = 'body';
        view.render(body, hass, this);
        this._sheet.replaceChildren(head, body);
        this._sheet.scrollTop = scrollTop;
        if (focused >= 0) {
            const controls = this._focusable();
            (controls[Math.min(focused, controls.length - 1)] || this._sheet).focus();
        }
    }

    _headButton(action, icon, labelKey, onClick) {
        const button = BuschUI.action({ label: translate(this._hass, labelKey), icon, variant: 'icon-only', onClick });
        button.setAttribute('data-action', action);
        return button;
    }
}

class BuschVacuumCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._opts = null;
        this._hass = null;
        this._errorKey = null;
        this._errorVars = null;
        this._card = null;
        this._seen = null; // what the last update read, see watchSnapshot()
        this._related = null;
        this._relatedFrom = null;
        this._pending = null; // { state, from, timer }: tapped target state until the device confirms
        this._task = 'all'; // chosen task type (CORE-06)
        // R21 on purpose: selection and repeats live only in memory; a remembered "3×" would clean three times unnoticed.
        this._selection = emptySelection(); // clean-tasks: rooms, zones, spots, goto in robot mm (R08)
        this._repeats = 1;
        this._run = null; // { at, stopped, seen }: a task this card started, until it ends (TASK-01)
        this._taskError = null; // R12 text of the last failed start
        this._zoneActive = null; // zone chosen in the list (keys and edit buttons)
        this._spotActive = null; // the same for spots
        this._dismissed = new Map(); // message kind → text wiped away, until the message changes (CORE-10)
        this._dialog = null;
        this._panel = false;
        this._locked = null; // null: not decided yet; the user's choice survives updates
        this._lockTimer = null;
        this._lockHeld = false;
        this._settingWrites = new Map(); // setting key → write waiting for the device (writeSetting)
        this._settingNotes = new Map(); // setting key → why the last write failed (R12)
        this._settingDone = new Map(); // action → what it achieved, shown once in its group (R11)
        this._drafts = new Map(); // form → unsaved input, kept when the form is left (R10)
        this._settingTexts = null;
    }

    /** Set by Home Assistant in a panel view. */
    set isPanel(value) {
        this._panel = !!value;
        this._applyLayout(true);
    }

    set layout(value) {
        this._panel = value === 'panel';
        this._applyLayout(true);
    }

    /** CORE-13/08/14: layout attributes on the host; the lock restarts on a new layout or config. */
    _applyLayout(reset) {
        if (!this._opts) return;
        const opts = this._opts;
        this.setAttribute('data-layout', this._panel ? 'panel' : opts.full_height ? 'full' : 'card');
        this.setAttribute('data-hand', opts.left_handed ? 'left' : 'right');
        // HA's own header height; set here because ui-regeln-pruefen.py does not list --header-height yet.
        this.style.setProperty('--bvc-header-height', 'var(--header-height, 56px)');
        this.style.setProperty('--bvc-height-offset', opts.max_height_offset + 'px');
        if (opts.aspect_ratio && !opts.full_height && !this._panel) {
            this.setAttribute('data-aspect', '');
            this.style.setProperty('--bvc-aspect-ratio', opts.aspect_ratio);
        } else {
            this.removeAttribute('data-aspect');
            this.style.removeProperty('--bvc-aspect-ratio');
        }
        if (reset || this._locked === null) {
            this._lockShown = startsLocked(opts.locked, touchDevice(), this._panel);
            this._locked = this._lockShown;
        }
        this.setAttribute('data-locked', String(this._locked));
        if (this._lock) this._renderLock();
        if (this._map) this._map.lockChanged();
    }

    /** hidden_card_objects (CORE-18). */
    _hidden(name) {
        return this._opts.hidden_card_objects.includes(name);
    }

    _menuEntries(model) {
        return menuFor(model).filter((entry) => !(entry.name === 'cruising_history' && this._hidden('cruising_history')));
    }

    _haptic() {
        if (!this._opts || this._opts.disable_haptic) return;
        try {
            if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(HAPTIC_MS);
        } catch (e) {
            // vibration refused (no user gesture, policy): stay silent
        }
    }

    _toggleLock() {
        this._locked = !this._locked;
        this._lockShown = true;
        this._haptic();
        this.setAttribute('data-locked', String(this._locked));
        this._renderLock();
        if (this._map) this._map.lockChanged();
    }

    _renderLock() {
        const model = this._hass ? this._model() : null;
        const label = translate(this._hass, this._locked ? 'gesperrt' : 'entsperrt');
        BuschUI.action({ node: this._lock, label, icon: this._locked ? 'mdi:lock' : 'mdi:lock-open-variant', variant: 'icon-only', onClick: (event) => {
            // Keyboard (detail 0) toggles at once; a pointer must hold (touch_lock).
            if (event && event.detail === 0) this._toggleLock();
        } });
        this._lock.hidden = !(model && model.can('map') && this._lockShown);
    }

    _buildLock() {
        const lock = document.createElement('button');
        lock.className = 'lock';
        const cancel = () => { clearTimeout(this._lockTimer); this._lockTimer = null; };
        lock.addEventListener('pointerdown', () => {
            cancel();
            this._lockTimer = setTimeout(() => { this._lockTimer = null; this._toggleLock(); }, this._opts.touch_lock);
        });
        for (const type of ['pointerup', 'pointercancel', 'pointerleave']) lock.addEventListener(type, cancel);
        this._lock = lock;
        return lock;
    }

    static getConfigElement() {
        return document.createElement(EDITOR_TAG);
    }

    static getStubConfig(hass, entities) {
        const pool = Array.isArray(entities) && entities.length ? entities : Object.keys((hass && hass.states) || {});
        return { type: `custom:${CARD_TAG}`, entity: pool.find((id) => domainOf(id) === 'vacuum') || '' };
    }

    setConfig(raw) {
        const validated = BuschUI.validateConfig(raw || {}, { normalize: normalizeConfig });
        if (validated.ok && this._opts && BuschUI.configsEqual(this._opts, validated.value)) return;
        this._opts = validated.ok ? validated.value : null;
        // Remembered as a key, translated when the box is drawn.
        this._errorKey = validated.ok ? null : (validated.error.textKey || 'fehlerKeineEntitaet');
        this._errorVars = validated.ok ? null : validated.error.textVars;
        this._related = null;
        this._endPending();
        this._locked = null;
        this._build();
        this._applyLayout(false);
    }

    set hass(hass) {
        // Home Assistant hands every card a new hass on every state change in
        // the house. Only the vacuum and the few sensors shown redraw.
        const unchanged = snapshotUnchanged(this._seen, hass) && (!hass || hass.entities === this._relatedFrom);
        this._hass = hass;
        // The card first: the map's state (e.g. a finished ignore) is current when the dialog draws.
        if (!unchanged) this._update();
        if (this._dialog) this._dialog.hass = hass;
    }

    get hass() {
        return this._hass;
    }

    getCardSize() {
        return 4;
    }

    /** Sections layout: full width by default, half (6 of 12) at the narrowest. */
    getGridOptions() {
        return { columns: 12, min_columns: 6 };
    }

    _build() {
        const root = this.shadowRoot;
        root.innerHTML = '';
        this._seen = null;
        const style = document.createElement('style');
        style.textContent = CARD_STYLES;
        root.appendChild(style);
        const card = document.createElement('ha-card');
        card.dataset.uiContract = 'Busch HA UI 0.1.0';
        root.appendChild(card);
        this._card = card;
        if (this._errorKey) {
            const box = document.createElement('div');
            box.className = 'error';
            box.appendChild(BuschUI.ha.icon('mdi:alert-circle-outline'));
            this._errorText = document.createElement('span');
            box.appendChild(this._errorText);
            card.appendChild(box);
        } else {
            this._title = document.createElement('h2');
            this._title.className = 'title';
            this._stateLine = document.createElement('div');
            this._stateLine.className = 'state';
            const head = BuschUI.header({ titleNode: this._title });
            head.classList.add('head');
            head.appendChild(this._title);
            head.appendChild(this._stateLine);
            // Built once and only hidden: the dialog hands focus back to this very node.
            this._menuButton = BuschUI.action({ label: translate(null, 'menu'), icon: 'mdi:dots-vertical', variant: 'icon-only', onClick: () => this._openDialog(this._menuView()) });
            this._menuButton.classList.add('menu-button');
            this._menuButton.setAttribute('aria-haspopup', 'dialog');
            const top = document.createElement('div');
            top.className = 'top';
            top.append(head, this._buildLock(), this._menuButton);
            this._stats = document.createElement('div');
            this._stats.className = 'stats';
            this._controls = document.createElement('div');
            this._controls.className = 'controls';
            this._progress = document.createElement('div');
            this._progress.className = 'progress-slot';
            this._messages = document.createElement('div');
            this._messages.className = 'messages';
            this._taskArea = document.createElement('div');
            this._taskArea.className = 'task-area';
            this._mapSlot = document.createElement('div');
            this._mapSlot.className = 'map-slot';
            this._mapSlot.hidden = true;
            this._map = null;
            card.append(this._progress, top, this._mapSlot, this._messages, this._stats, this._taskArea, this._controls);
        }
        this._update();
    }

    _model() {
        const hass = this._hass;
        if (!this._related || hass.entities !== this._relatedFrom) {
            // shortcut: without a registry the prefix fallback is computed once per
            // config; entities added later need a reload. Fine for old frontends only.
            this._related = findRelated(hass, this._opts.entity);
            this._relatedFrom = hass.entities;
        }
        return new VacuumModel(hass, this._opts.entity, this._related);
    }

    _update() {
        const hass = this._hass;
        if (!hass || !this._card) return;
        if (this._errorKey) {
            this._errorText.textContent = translate(hass, this._errorKey, this._errorVars);
            this._seen = watchSnapshot(hass, []);
            return;
        }
        const model = this._model();
        const real = model.state;
        if (this._pending && (!real || real.state === this._pending.state || real.state !== this._pending.from)) this._endPending();
        const mapCamera = model.can('map') ? model.related.maps.map[0] : null;
        // The active map camera carries the robot's position: watched like the vacuum.
        // Scripts of the shortcut menu are watched too: name and running state (shortcuts).
        this._seen = watchSnapshot(hass, [this._opts.entity, ...this._opts.scripts, ...(mapCamera ? [mapCamera] : []), ...['sensor.battery_level', 'sensor.cleaned_area', 'sensor.cleaning_time', 'binary_sensor.charging_state', 'sensor.error', 'sensor.cleaning_progress', 'sensor.cleaning_history'].map((k) => model.entity(k)).filter(Boolean)]);
        const shown = this._pending ? this._pending.state : real ? real.state : 'unavailable';

        this._title.textContent = this._opts.title || (real && real.attributes.friendly_name) || this._opts.entity;
        this._title.hidden = this._hidden('title');
        this._stateLine.hidden = this._hidden('state');
        this._stats.hidden = this._hidden('status');
        this._controls.hidden = this._hidden('controls');
        const menuLabel = translate(hass, 'menu');
        BuschUI.action({ node: this._menuButton, label: menuLabel, icon: 'mdi:dots-vertical', variant: 'icon-only', onClick: () => this._openDialog(this._menuView()) });
        this._menuButton.hidden = this._hidden('menu') || this._menuEntries(model).length === 0;
        this._renderLock();
        this._stateLine.textContent = real ? formatState(hass, real, shown) : shown;
        this._mapSlot.hidden = !mapCamera;
        if (mapCamera) {
            if (!this._map) {
                this._map = new MapView(this);
                this._mapSlot.appendChild(this._map.el);
                for (const type of ['map-room-tap', 'map-tap', 'map-drag', 'map-changed']) this._map.el.addEventListener(type, (e) => this._onMapEvent(e));
            }
            this._map.update(hass, model);
        }

        const stats = [];
        const area = statText(hass, model, 'sensor.cleaned_area', 'cleaned_area', 'm²');
        if (area !== null) stats.push(this._metric('area', 'flaeche', area, 'mdi:texture-box'));
        const time = statText(hass, model, 'sensor.cleaning_time', 'cleaning_time', 'min');
        if (time !== null) stats.push(this._metric('time', 'zeit', time, 'mdi:timer-outline'));
        const battery = batteryInfo(hass, model);
        if (battery) {
            const node = this._metric('battery', 'akku', battery.text, battery.icon);
            node.setAttribute('data-battery', battery.kind);
            stats.push(node);
        }
        this._stats.replaceChildren(...stats);

        const active = taskActive(model, shown);
        this._checkEnd(model, real ? taskActive(model, real.state) : false);
        const percent = active && model.can('cleaning_progress') && !this._hidden('progress_bar') ? progressOf(hass, model) : null;
        this._progress.replaceChildren(...(percent === null ? [] : [this._progressBar(percent)]));
        this._renderMessages(hass, model);
        const task = this._chosenTask(model);
        const ready = this._renderTasks(hass, model, active, task);
        this._syncTaskMap(model, active, task);

        // CORE-08: Go-To has no action buttons; its target bubble is the one start.
        const names = this._hidden('action_buttons') || (!active && task === 'goto') ? [] : controlsFor(model, shown);
        const outside = names[0] === 'return'; // idle outside the dock (controlsFor)
        const buttons = names.map((name) => {
            const label = translate(hass, outside && name === 'return' ? 'zurueckZumDock' : name);
            const blocked = name === 'start' && !ready.ok;
            const variant = outside ? (name === 'return' ? 'primary' : 'secondary') : CONTROLS[name].variant || 'secondary';
            const button = BuschUI.action({ label, text: label, icon: CONTROLS[name].icon, variant, disabled: blocked, onClick: () => (name === 'start' ? this._startTask(real) : this._call(name, real)) });
            if (blocked) button.setAttribute('aria-describedby', 'task-hint');
            button.classList.add('ctl');
            button.setAttribute('data-action', name);
            return button;
        });
        if (!this._hidden('shortcuts') && shortcutEntries(hass, model, this._opts.scripts).length) {
            const label = translate(hass, 'shortcuts');
            const button = BuschUI.action({ label, text: label, icon: 'mdi:star-four-points-outline', onClick: () => this._openDialog(shortcutMenu(this)) });
            button.classList.add('ctl');
            button.setAttribute('data-action', 'shortcuts');
            button.setAttribute('aria-haspopup', 'menu');
            buttons.push(button);
        }
        if (model.can('dock') && !this._hidden('dock_status_indicator')) buttons.push(this._dock(hass, model));
        this._controls.replaceChildren(...buttons);
    }

    _openDialog(view) {
        if (this._dialog && this._dialog.isConnected) return;
        const dialog = document.createElement(DIALOG_TAG);
        dialog.toggleAttribute('data-still', this._hidden('animations'));
        dialog.hass = this._hass;
        dialog.show(view);
        dialog.addEventListener('dialog-closed', () => { if (this._dialog === dialog) this._dialog = null; });
        this._dialog = dialog;
        document.body.appendChild(dialog);
    }

    /** Main menu (CORE-05): entries by can(); Locate acts, the others open their module's view. */
    _menuView() {
        return {
            title: translate(this._hass, 'menu'),
            kind: 'menu',
            watch: () => [this._opts.entity],
            render: (body, hass, dialog) => {
                const model = this._model();
                const list = document.createElement('div');
                list.className = 'menu';
                for (const entry of this._menuEntries(model)) {
                    const text = translate(hass, entry.text);
                    const low = entry.name === 'consumables' ? Object.values(model.consumables()).filter((v) => v < 30).length : 0;
                    const lowText = low ? translate(hass, 'zubehoerNiedrig', { n: low }) : '';
                    const item = BuschUI.action({ label: lowText ? text + ' · ' + lowText : text, text, icon: entry.icon, variant: 'quiet', onClick: () => {
                        if (entry.name === 'locate') {
                            hass.callService('vacuum', 'locate', { entity_id: this._opts.entity });
                            dialog.close();
                        } else dialog.show(MODULE_VIEWS[entry.name] ? MODULE_VIEWS[entry.name](this) : this._placeholderView(entry));
                    } });
                    item.classList.add('menu-item');
                    item.setAttribute('data-entry', entry.name);
                    if (low) {
                        const badge = document.createElement('span');
                        badge.className = 'badge';
                        badge.setAttribute('aria-hidden', 'true');
                        badge.textContent = String(low);
                        item.appendChild(badge);
                    }
                    list.appendChild(item);
                }
                body.appendChild(list);
            }
        };
    }

    /** Filled by the entry's module; until then it says so. Kind editor: these become settings (R04). */
    _placeholderView(entry) {
        return {
            title: translate(this._hass, entry.text),
            kind: 'editor',
            render: (body, hass) => {
                const note = document.createElement('p');
                note.className = 'placeholder';
                note.textContent = translate(hass, 'platzhalter', { modul: entry.module });
                body.appendChild(note);
            }
        };
    }

    /**
     * CORE-20: a map change asks first, unless `map_change_confirmation` is
     * hidden. map-view calls this with the map's name and the change itself.
     */
    _confirmMapChange(name, change) {
        if (this._hidden('map_change_confirmation')) {
            change();
            return;
        }
        const view = {
            title: translate(this._hass, 'kartenWechselTitel'),
            kind: 'confirm',
            render: (body, hass, dialog) => {
                const question = document.createElement('p');
                question.className = 'placeholder';
                question.textContent = translate(hass, 'kartenWechselFrage', { karte: name });
                const actions = document.createElement('div');
                actions.className = 'actions';
                const cancel = BuschUI.action({ label: translate(hass, 'abbrechen'), text: translate(hass, 'abbrechen'), onClick: () => dialog.close() });
                cancel.setAttribute('data-action', 'cancel');
                const confirm = BuschUI.action({ label: translate(hass, 'wechseln'), text: translate(hass, 'wechseln'), variant: 'primary', onClick: () => { dialog.close(); change(); } });
                confirm.setAttribute('data-action', 'confirm');
                actions.append(cancel, confirm);
                body.append(question, actions);
            }
        };
        if (this._dialog && this._dialog.isConnected) this._dialog.show(view);
        else this._openDialog(view);
    }

    _progressBar(percent) {
        const bar = document.createElement('progress');
        bar.className = 'progress';
        bar.max = 100;
        bar.value = percent;
        bar.setAttribute('aria-label', translate(this._hass, 'fortschritt', { wert: Math.round(percent) }));
        return bar;
    }

    /** The chosen task type if this device offers it, else 'all'. */
    _chosenTask(model) {
        const types = tasksFor(model);
        return types.length > 1 && types.some((t) => t.name === this._task) ? this._task : 'all';
    }

    /** Task type choice (CORE-06) and the chosen type's panel. Returns taskReady() for Start. */
    _renderTasks(hass, model, active, task) {
        const ready = active ? { ok: true, reason: null } : taskReady(model, task, this._selection, this._taskMap());
        if (this._hidden('task_type')) {
            this._taskArea.replaceChildren();
            return ready;
        }
        const types = tasksFor(model);
        const nodes = [];
        const chosen = active ? runningTask(model) : task;
        const head = document.createElement('div');
        head.className = 'task-head';
        if (types.length > 1) {
            const group = document.createElement('div');
            group.className = 'tasks';
            group.setAttribute('role', 'radiogroup');
            group.setAttribute('aria-label', translate(hass, 'aufgabenart'));
            const shownChoice = types.some((t) => t.name === chosen) ? chosen : 'all';
            types.forEach((type, index) => {
                const label = translate(hass, type.text);
                const button = BuschUI.action({ label, text: label, icon: type.icon, disabled: active, onClick: () => this._chooseTask(type.name) });
                button.classList.add('task');
                button.setAttribute('role', 'radio');
                button.setAttribute('data-task', type.name);
                button.setAttribute('aria-checked', String(type.name === shownChoice));
                button.tabIndex = type.name === shownChoice ? 0 : -1;
                button.addEventListener('keydown', (event) => {
                    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
                    if (!step || active) return;
                    event.preventDefault();
                    this._chooseTask(types[(index + step + types.length) % types.length].name, true);
                    const next = this._taskArea.querySelector('[data-task="' + this._task + '"]');
                    if (next) next.focus();
                });
                group.appendChild(button);
            });
            head.appendChild(group);
        }
        // SET-01: not while a scheduled, shortcut or CleanGenius task runs (their settings are fixed).
        if (model.can('settings') && !(active && ['scheduled_clean', 'shortcut_task', 'cleangenius_cleaning'].some((k) => model.attr(k) === true))) {
            const label = translate(hass, 'einstellungen');
            const button = BuschUI.action({ label: translate(hass, 'reinigungseinstellungen'), text: label, icon: 'mdi:tune-variant', onClick: () => this._openDialog(cleanSettingsView(this)) });
            button.classList.add('task-settings');
            button.setAttribute('data-action', 'clean-settings');
            head.appendChild(button);
        }
        if (head.childNodes.length) nodes.push(head);
        if (active) {
            const [key, icon] = model.attr('scheduled_clean') ? ['aufgabeGeplant', 'mdi:calendar-clock']
                : model.attr('shortcut_task') ? ['aufgabeShortcut', 'mdi:star-four-points-outline']
                : ['aufgabeLaeuft', 'mdi:progress-clock'];
            nodes.push(this._note('task-badge', icon, translate(hass, key)));
        } else {
            if (task === 'room') nodes.push(...this._roomPanel(hass, model));
            if (task === 'zone') nodes.push(...this._zonePanel(hass, model));
            if (task === 'spot') nodes.push(...this._spotPanel(hass, model));
            if (task === 'goto') nodes.push(...this._gotoPanel(hass, model));
            // TASK-06: room without Customized Cleaning (else the rooms' own values go), zone, spot.
            if (task === 'zone' || task === 'spot' || (task === 'room' && model.attr('customized_cleaning') !== true)) nodes.push(repeatsRow(this));
            if (this._undo) {
                const note = this._note('task-note', 'mdi:undo-variant', translate(hass, 'auswahlGeleert'));
                note.appendChild(this._panelButton(hass, 'rueckgaengig', 'mdi:undo', 'undo', () => this._undoClear()));
                nodes.push(note);
            }
            if (this._taskInfo) {
                const note = this._note('task-note', 'mdi:map-marker-alert-outline', translate(hass, this._taskInfo.key));
                note.setAttribute('data-note', this._taskInfo.note);
                nodes.push(note);
            }
            // Zone, spot and the simulated Go-To switch CleanGenius off for the task (device.py#L4854, L5065, L5139).
            if (model.attr('cleangenius_cleaning') === true && (task === 'zone' || task === 'spot' || (task === 'goto' && !model.can('cruising')))) {
                const note = this._note('task-note', 'mdi:creation-outline', translate(hass, 'cleanGeniusAus'));
                note.setAttribute('data-note', 'cleangenius');
                nodes.push(note);
            }
            if (!ready.ok) nodes.push(this._note('task-hint', 'mdi:information-outline', translate(hass, ready.reason, { min: this._zoneMinText() })));
            if (this._taskError) {
                const error = this._note('task-error', 'mdi:alert-circle-outline', this._taskError);
                error.setAttribute('role', 'alert');
                nodes.push(error);
            }
        }
        const root = this.shadowRoot;
        const focused = root.activeElement && root.activeElement.getAttribute ? root.activeElement.getAttribute('data-action') : null;
        this._taskArea.replaceChildren(...nodes);
        this._renderGotoBubble(hass, model, !active && task === 'goto', ready);
        // Rebuilt on every own update: keyboard focus stays on the same control.
        const again = focused && (this._taskArea.querySelector('[data-action="' + focused + '"]') || (this._gotoBubble && this._gotoBubble.querySelector('[data-action="' + focused + '"]')));
        if (again && !again.disabled) again.focus();
        return ready;
    }

    _chooseTask(name, quiet) {
        if (!quiet) this._haptic();
        this._task = name;
        this._taskError = null;
        this._update();
    }

    /** What taskReady() needs from the map: passable and the grid in mm (map data, else 50). */
    _taskMap() {
        const m = this._map;
        if (!m) return null;
        return { passable: (p) => m.passable(p), grid: (m._data && m._data.grid.grid) || GRID_MM };
    }

    _zoneMinText() {
        const map = this._taskMap();
        return String(2 * ((map && map.grid) || GRID_MM)) + ' mm';
    }

    /** Map mode and the layer `tasks` for the chosen type; while a task runs the layer shows its targets. */
    _syncTaskMap(model, active, task) {
        const m = this._map;
        if (!m) return;
        // TASK-04: "Spot hier" in the obstacle dialog sets a point, never starts (map-view MAP-04 slot).
        if (tasksFor(model).some((t) => t.name === 'spot')) m.addObstacleAction('spot', { label: translate(this._hass, 'spotHier'), icon: 'mdi:target', run: (o) => this._spotHere(o) });
        else m.removeObstacleAction('spot');
        const mode = active ? 'view' : TASK_MAP_MODES[task] || 'view';
        const layer = active || task !== 'all';
        const key = mode + '|' + layer + '|' + task;
        if (key !== this._taskMapKey) {
            this._taskMapKey = key;
            m.setMode(mode, mode === 'view' ? {} : this._taskModeOptions(task));
            if (layer) m.addLayer('tasks', { z: 58, render: (group, ctx) => drawTasks(this, group, ctx), hit: (point, ctx) => hitTasks(this, point, ctx) });
            else m.removeLayer('tasks');
            this._activeSig = null;
        }
        // Running targets change with the camera's attributes, not always with its frame.
        const a = cameraAttrs(model);
        const sig = active ? JSON.stringify([a.active_segments, a.active_areas, a.active_points, a.active_cruise_points]) : null;
        if (layer && sig !== this._activeSig) {
            this._activeSig = sig;
            m.refresh('tasks');
        }
    }

    /** Options of setMode for a task type: pick-room shows the selection and its order on the chips. */
    _taskModeOptions(task) {
        if (task !== 'room') return {};
        return { selected: () => this._selection.rooms.slice(), order: () => this._roomOrder(this._model()), fallbackRooms: () => vacuumRooms(this._model()) };
    }

    /** Rooms to choose from: the map's, else (camera away, R18) the vacuum's list; hidden ones never. */
    _taskRooms(model) {
        const m = this._map;
        const rooms = m && m._showsMap() ? m.current().rooms : vacuumRooms(model);
        return Object.fromEntries(Object.entries(rooms).filter(([, r]) => r && r.visibility !== 'Hidden'));
    }

    /**
     * Order of the chosen rooms: tap order only where the device takes it;
     * with customized_cleaning (X40) it cleans in the saved sequence
     * (device.py#L4954, L7148), so the badges show that.
     */
    _roomOrder(model) {
        const picked = this._selection.rooms;
        if (!model.can('customized_cleaning')) return picked.slice();
        const sequence = (model.attr('cleaning_sequence') || []).map(Number).filter((id) => picked.includes(id));
        return sequence.concat(picked.filter((id) => !sequence.includes(id)));
    }

    /** Selection changed: map layer, chips and panel follow (R08). */
    _selectionChanged() {
        this._taskError = null;
        if (this._taskInfo && this._taskInfo.note === 'outside') this._taskInfo = null;
        if (this._map) this._map.refresh('tasks');
        this._update();
    }

    /** Clears a part of the selection with a 5-s undo (R13). */
    _clearSelection(part) {
        const before = this._selection[part].slice();
        if (!before.length) return;
        if (this._undo) clearTimeout(this._undo.timer);
        const undo = { part, before, timer: null };
        undo.timer = setTimeout(() => { if (this._undo === undo) { this._undo = null; this._update(); } }, 5000);
        this._undo = undo;
        this._selection[part] = [];
        this._selectionChanged();
    }

    _undoClear() {
        const undo = this._undo;
        if (!undo) return;
        clearTimeout(undo.timer);
        this._undo = null;
        this._selection[undo.part] = undo.before;
        this._selectionChanged();
    }

    /** Map contract events of the task types. */
    _onMapEvent(e) {
        const d = e.detail || {};
        if (e.type === 'map-changed') {
            // IDs and coordinates belong to one map.
            const had = this._selection.rooms.length || this._selection.zones.length || this._selection.spots.length || this._selection.goto;
            this._selection = emptySelection();
            this._taskInfo = had ? { key: 'auswahlKarteGewechselt', note: 'map-changed' } : null;
            this._zoneActive = null;
            this._spotActive = null;
            this._selectionChanged();
            return;
        }
        const model = this._model();
        if (taskActive(model, model.state ? model.state.state : 'unavailable')) return;
        const task = this._chosenTask(model);
        if (e.type === 'map-room-tap' && task === 'room' && d.mode === 'pick-room') this._toggleRoom(model, Number(d.room), d.shift);
        if (task === 'spot' && d.mode === 'pick-point' && e.type === 'map-tap' && d.robot) this._spotTap(d);
        if (task === 'goto' && d.mode === 'pick-point' && e.type === 'map-tap' && d.robot) this._setGoto(d.robot);
        if (task === 'zone' && d.mode === 'draw-rect') {
            if (e.type === 'map-tap' && d.robot) this._zoneTap(d);
            if (e.type === 'map-drag') this._zoneDrag(d);
        }
    }

    _toggleRoom(model, id, range) {
        const rooms = this._taskRooms(model);
        if (!rooms[id]) return;
        const picked = this._selection.rooms;
        const ids = Object.keys(rooms).map(Number);
        if (range && this._lastRoom !== undefined && ids.includes(this._lastRoom)) {
            const [a, b] = [ids.indexOf(this._lastRoom), ids.indexOf(id)].sort((x, y) => x - y);
            for (const r of ids.slice(a, b + 1)) if (!picked.includes(r)) picked.push(r);
        } else if (picked.includes(id)) picked.splice(picked.indexOf(id), 1);
        else picked.push(id);
        this._lastRoom = id;
        this._selectionChanged();
    }

    /** Room panel (TASK-02): count, select all, clear with undo, order note. */
    _roomPanel(hass, model) {
        const nodes = [];
        const n = this._selection.rooms.length;
        const tools = document.createElement('div');
        tools.className = 'task-tools';
        const count = document.createElement('span');
        count.className = 'task-count';
        count.setAttribute('role', 'status');
        count.setAttribute('data-note', 'count');
        count.textContent = translate(hass, n === 1 ? 'raumGewaehlt' : 'raeumeGewaehlt', { n });
        const all = this._panelButton(hass, 'alleWaehlen', 'mdi:select-all', 'rooms-all', () => {
            for (const id of Object.keys(this._taskRooms(model)).map(Number)) if (!this._selection.rooms.includes(id)) this._selection.rooms.push(id);
            this._selectionChanged();
        });
        const clear = this._panelButton(hass, 'auswahlLeeren', 'mdi:selection-remove', 'rooms-clear', () => this._clearSelection('rooms'), n === 0);
        tools.append(count, all, clear);
        nodes.push(tools);
        if (n && model.can('customized_cleaning')) {
            const note = this._note('task-note', 'mdi:sort-numeric-ascending', translate(hass, 'reihenfolgeGespeichert'));
            note.setAttribute('data-note', 'order');
            nodes.push(note);
        }
        return nodes;
    }

    /** A labelled panel button with a stable data-action (focus survives the redraw). */
    _panelButton(hass, key, icon, name, onClick, disabled = false, vars) {
        const label = translate(hass, key, vars);
        const button = BuschUI.action({ label, text: label, icon, variant: 'secondary', disabled, onClick });
        button.setAttribute('data-action', name);
        return button;
    }

    // ── Zone (TASK-03) ────────────────────────────────────────────────────

    /** Smallest side: the device wants more than 2 × grid_size (device.py#L4831), plus one cell. */
    _zoneMin() {
        const map = this._taskMap();
        return 3 * ((map && map.grid) || GRID_MM);
    }

    _fitZone(z) {
        const min = this._zoneMin();
        const r = { x0: Math.min(z.x0, z.x1), y0: Math.min(z.y0, z.y1), x1: Math.max(z.x0, z.x1), y1: Math.max(z.y0, z.y1) };
        if (r.x1 - r.x0 < min) r.x1 = r.x0 + min;
        if (r.y1 - r.y0 < min) r.y1 = r.y0 + min;
        return { x0: Math.round(r.x0), y0: Math.round(r.y0), x1: Math.round(r.x1), y1: Math.round(r.y1) };
    }

    _client(robot) {
        const m = this._map;
        return m ? m.toScreen(m.toImage(robot)) : null;
    }

    /** Client points of a zone's corner handles and its × (beside the corner that is top right on screen). */
    _zoneHandles(i) {
        const z = this._selection.zones[i];
        if (!z) return null;
        const corners = [[z.x0, z.y0], [z.x1, z.y0], [z.x1, z.y1], [z.x0, z.y1]].map(([x, y]) => this._client({ x, y }));
        if (corners.some((c) => !c)) return null;
        const k = corners.reduce((best, c, j) => (c.x - c.y > corners[best].x - corners[best].y ? j : best), 0);
        const off = 18 * this._map.config(this._map._attrs().map_index).object_scale;
        return { corners, k, remove: { x: corners[k].x + off, y: corners[k].y - off } };
    }

    /** A robot-mm step of `mm` in a screen direction, snapped to the map's nearest axis (keys and buttons match dragging). */
    _zoneStep(dir, mm) {
        const unit = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[dir];
        const m = this._map;
        if (m && m._view) {
            const rect = m._stageRect();
            const c = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
            const a = m.toRobot(m.fromScreen(c)), b = m.toRobot(m.fromScreen({ x: c.x + unit[0] * 10, y: c.y + unit[1] * 10 }));
            if (a && b) {
                const dx = b.x - a.x, dy = b.y - a.y;
                return Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx) * mm, y: 0 } : { x: 0, y: Math.sign(dy) * mm };
            }
        }
        return { x: unit[0] * mm, y: -unit[1] * mm };
    }

    _moveZone(i, dir, mm) {
        const z = this._selection.zones[i];
        const d = this._zoneStep(dir, mm);
        this._selection.zones[i] = { x0: z.x0 + d.x, y0: z.y0 + d.y, x1: z.x1 + d.x, y1: z.y1 + d.y };
        this._selectionChanged();
    }

    /** Wider/narrower (screen right edge) or taller/shorter (screen top edge), never below the minimum. */
    _resizeZone(i, dir, mm) {
        const z = Object.assign({}, this._selection.zones[i]);
        const d = this._zoneStep(dir, 1), min = this._zoneMin();
        if (d.x > 0) z.x1 = Math.max(z.x0 + min, z.x1 + mm);
        if (d.x < 0) z.x0 = Math.min(z.x1 - min, z.x0 - mm);
        if (d.y > 0) z.y1 = Math.max(z.y0 + min, z.y1 + mm);
        if (d.y < 0) z.y0 = Math.min(z.y1 - min, z.y0 - mm);
        this._selection.zones[i] = z;
        this._selectionChanged();
    }

    _removeZone(i) {
        this._selection.zones.splice(i, 1);
        this._zoneActive = this._selection.zones.length ? Math.min(i, this._selection.zones.length - 1) : null;
        if (this._zoneActive !== null && i !== this._zoneActive) this._zoneActive = null;
        this._selectionChanged();
    }

    _addZone(z) {
        this._selection.zones.push(this._fitZone(z));
        this._zoneActive = this._selection.zones.length - 1;
        this._selectionChanged();
    }

    /** Centre of the visible map in robot mm, or null without calibration. */
    _mapCentre() {
        const m = this._map;
        if (!m || !m._view) return null;
        const rect = m._stageRect();
        return m.toRobot(m.fromScreen({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }));
    }

    _zoneTap(d) {
        const id = d.hit && d.hit.layer === 'tasks' ? String(d.hit.id) : '';
        const [kind, i] = id.split(':');
        if (kind === 'zone-remove') return this._removeZone(Number(i));
        if (kind === 'zone' || kind === 'zone-corner') {
            this._zoneActive = Number(i);
            return this._update();
        }
        const outline = outlineAt(this._map, d.robot);
        if (outline) return this._addZone(outline);
        if (d.passable === false) {
            this._taskInfo = { key: 'punktAusserhalb', note: 'outside' };
            return this._update();
        }
        const half = SPOT_MM / 2;
        this._addZone({ x0: d.robot.x - half, y0: d.robot.y - half, x1: d.robot.x + half, y1: d.robot.y + half });
    }

    /** draw-rect: a corner handle scales, the area moves, elsewhere a new rectangle is drawn. */
    _zoneDrag(d) {
        const zones = this._selection.zones;
        if (d.phase === 'start') {
            const [kind, i, j] = String((this._hitSelection(d.start) || {}).id || '').split(':');
            if (kind === 'zone-corner') this._drag = { kind: 'corner', i: Number(i), j: Number(j), origin: Object.assign({}, zones[i]), start: d.start };
            else if (kind === 'zone' || kind === 'zone-remove') this._drag = { kind: 'move', i: Number(i), origin: Object.assign({}, zones[i]), start: d.start };
            else {
                zones.push({ x0: d.start.x, y0: d.start.y, x1: d.start.x, y1: d.start.y });
                this._drag = { kind: 'draw', i: zones.length - 1, start: d.start };
            }
            this._zoneActive = this._drag.i;
            return;
        }
        const g = this._drag;
        if (!g) return;
        if (d.phase !== 'move' && this._dragFrame) {
            cancelAnimationFrame(this._dragFrame);
            this._dragFrame = null;
        }
        if (d.phase === 'cancel') {
            if (g.kind === 'draw') zones.splice(g.i, 1);
            else zones[g.i] = g.origin;
            this._drag = null;
            return this._selectionChanged();
        }
        const p = d.robot;
        if (p) {
            if (g.kind === 'move') zones[g.i] = { x0: g.origin.x0 + p.x - g.start.x, y0: g.origin.y0 + p.y - g.start.y, x1: g.origin.x1 + p.x - g.start.x, y1: g.origin.y1 + p.y - g.start.y };
            else if (g.kind === 'corner') {
                const o = g.origin, opposite = [[o.x0, o.y0], [o.x1, o.y0], [o.x1, o.y1], [o.x0, o.y1]][(g.j + 2) % 4];
                zones[g.i] = { x0: opposite[0], y0: opposite[1], x1: p.x, y1: p.y };
            } else zones[g.i] = { x0: g.start.x, y0: g.start.y, x1: p.x, y1: p.y };
        }
        if (d.phase === 'end') {
            zones[g.i] = this._fitZone(zones[g.i]);
            this._drag = null;
            return this._selectionChanged();
        }
        // R20: while dragging only the own layer redraws, at most once per animation frame.
        if (!this._dragFrame) this._dragFrame = requestAnimationFrame(() => {
            this._dragFrame = null;
            if (this._map) this._map.refresh('tasks');
        });
    }

    /** Zone panel: add, the list (R15/R16: name and size), edit buttons for the chosen zone, keys. */
    _zonePanel(hass, model) {
        const nodes = [];
        const zones = this._selection.zones;
        if (this._zoneActive !== null && this._zoneActive !== undefined && !zones[this._zoneActive]) this._zoneActive = null;
        const tools = document.createElement('div');
        tools.className = 'task-tools';
        const centre = this._mapCentre();
        const add = this._panelButton(hass, 'bereichHinzufuegen', 'mdi:plus-box-outline', 'zone-add', () => {
            const c = this._mapCentre();
            if (c) this._addZone({ x0: c.x - SPOT_MM / 2, y0: c.y - SPOT_MM / 2, x1: c.x + SPOT_MM / 2, y1: c.y + SPOT_MM / 2 });
        }, !centre);
        tools.appendChild(add);
        if (zones.length) tools.appendChild(this._panelButton(hass, 'auswahlLeeren', 'mdi:selection-remove', 'zones-clear', () => this._clearSelection('zones')));
        nodes.push(tools);
        if (zones.length) {
            const list = document.createElement('div');
            list.className = 'task-list';
            list.setAttribute('role', 'group');
            list.setAttribute('aria-label', translate(hass, 'bereiche'));
            const map = this._taskMap();
            const size = (mm) => new Intl.NumberFormat(localeOf(hass).language, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(mm) / 1000);
            zones.forEach((z, i) => {
                const outside = !!map && zoneSamples(z).every((p) => map.passable(p) === false);
                const text = translate(hass, 'bereichName', { n: i + 1, w: size(z.x1 - z.x0), h: size(z.y1 - z.y0) }) + (outside ? ' · ' + translate(hass, 'ausserhalb') : '');
                const button = BuschUI.action({ label: text, text, icon: outside ? 'mdi:alert-outline' : 'mdi:vector-square', variant: 'secondary', onClick: () => {
                    this._zoneActive = this._zoneActive === i ? null : i;
                    this._update();
                } });
                button.classList.add('task-item');
                button.setAttribute('data-action', 'zone-' + i);
                button.setAttribute('aria-pressed', String(this._zoneActive === i));
                button.addEventListener('keydown', (event) => this._zoneKey(event, i));
                list.appendChild(button);
            });
            nodes.push(list);
        }
        const i = this._zoneActive;
        if (i !== null && i !== undefined && zones[i]) {
            const edit = document.createElement('div');
            edit.className = 'task-edit';
            edit.setAttribute('role', 'group');
            edit.setAttribute('aria-label', translate(hass, 'bereichBearbeiten', { n: i + 1 }));
            const step = (event) => (event && event.shiftKey ? 500 : 100);
            for (const [dir, icon] of [['left', 'mdi:arrow-left'], ['up', 'mdi:arrow-up'], ['down', 'mdi:arrow-down'], ['right', 'mdi:arrow-right']]) {
                const label = translate(hass, 'nach_' + dir);
                const button = BuschUI.action({ label, icon, variant: 'secondary', onClick: (event) => this._moveZone(i, dir, step(event)) });
                button.setAttribute('data-action', 'zone-' + dir);
                edit.appendChild(button);
            }
            for (const [name, key, dir, sign, icon] of [['narrower', 'schmaler', 'right', -1, 'mdi:arrow-collapse-horizontal'], ['wider', 'breiter', 'right', 1, 'mdi:arrow-expand-horizontal'],
                ['shorter', 'niedriger', 'up', -1, 'mdi:arrow-collapse-vertical'], ['taller', 'hoeher', 'up', 1, 'mdi:arrow-expand-vertical']]) {
                const label = translate(hass, key);
                const button = BuschUI.action({ label, text: label, icon, variant: 'secondary', onClick: (event) => this._resizeZone(i, dir, sign * step(event)) });
                button.setAttribute('data-action', 'zone-' + name);
                edit.appendChild(button);
            }
            const remove = this._panelButton(hass, 'entfernen', 'mdi:close', 'zone-remove', () => this._removeZone(i));
            edit.appendChild(remove);
            nodes.push(edit);
            nodes.push(this._keyHint(hass, 'tastenBereich'));
        }
        return nodes;
    }

    /** Keys on a zone entry: arrows move (Shift 500 mm), Alt+arrows scale, Delete removes, Escape deselects (R03/R15). */
    _zoneKey(event, i) {
        const dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[event.key];
        if (dir) {
            event.preventDefault();
            this._zoneActive = i;
            if (event.altKey) this._resizeZone(i, dir === 'left' || dir === 'right' ? 'right' : 'up', (dir === 'right' || dir === 'up' ? 1 : -1) * 100);
            else this._moveZone(i, dir, event.shiftKey ? 500 : 100);
        } else if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            this._removeZone(i);
        } else if (event.key === 'Escape' && this._zoneActive === i) {
            event.preventDefault();
            this._zoneActive = null;
            this._update();
        }
    }

    _keyHint(hass, key) {
        const note = this._note('task-note', 'mdi:keyboard-outline', translate(hass, key));
        note.setAttribute('data-note', 'keys');
        return note;
    }

    // ── Spot (TASK-04) ────────────────────────────────────────────────────

    /** Client points of a spot and its × (up right of it on screen). */
    _spotHandles(i) {
        const p = this._selection.spots[i];
        const c = p && this._client(p);
        if (!c) return null;
        const off = 18 * this._map.config(this._map._attrs().map_index).object_scale;
        return { point: c, remove: { x: c.x + off, y: c.y - off } };
    }

    _addSpot(p) {
        this._selection.spots.push({ x: Math.round(p.x), y: Math.round(p.y) });
        this._spotActive = this._selection.spots.length - 1;
        this._selectionChanged();
    }

    _removeSpot(i) {
        this._selection.spots.splice(i, 1);
        this._spotActive = null;
        this._selectionChanged();
    }

    _moveSpot(i, dir, mm) {
        const p = this._selection.spots[i], d = this._zoneStep(dir, mm);
        this._selection.spots[i] = { x: p.x + d.x, y: p.y + d.y };
        this._spotActive = i;
        this._selectionChanged();
    }

    _spotTap(d) {
        const id = d.hit && d.hit.layer === 'tasks' ? String(d.hit.id) : '';
        const [kind, i] = id.split(':');
        if (kind === 'spot-remove') return this._removeSpot(Number(i));
        if (kind === 'spot') {
            this._spotActive = Number(i);
            return this._update();
        }
        if (d.passable === false) {
            this._taskInfo = { key: 'punktAusserhalb', note: 'outside' };
            return this._update();
        }
        this._addSpot(d.robot);
    }

    /** From the obstacle dialog: switch to Spot and set the point; starting stays a deliberate tap. */
    _spotHere(o) {
        if (this._dialog && this._dialog.isConnected) this._dialog.close();
        this._task = 'spot';
        this._addSpot({ x: Number(o.x), y: Number(o.y) });
    }

    _spotPanel(hass, model) {
        const nodes = [];
        const spots = this._selection.spots;
        if (this._spotActive !== null && !spots[this._spotActive]) this._spotActive = null;
        const robot = cameraAttrs(model).vacuum_position;
        const tools = document.createElement('div');
        tools.className = 'task-tools';
        tools.appendChild(this._panelButton(hass, 'punktAmRoboter', 'mdi:robot-vacuum', 'spot-robot', () => this._addSpot(robot), !robot));
        if (spots.length) tools.appendChild(this._panelButton(hass, 'auswahlLeeren', 'mdi:selection-remove', 'spots-clear', () => this._clearSelection('spots')));
        nodes.push(tools);
        if (spots.length) {
            const list = document.createElement('div');
            list.className = 'task-list';
            list.setAttribute('role', 'group');
            list.setAttribute('aria-label', translate(hass, 'punkte'));
            spots.forEach((p, i) => {
                const text = translate(hass, 'punktName', { n: i + 1 });
                const button = BuschUI.action({ label: text, text, icon: 'mdi:target', variant: 'secondary', onClick: () => {
                    this._spotActive = this._spotActive === i ? null : i;
                    this._update();
                } });
                button.classList.add('task-item');
                button.setAttribute('data-action', 'spot-' + i);
                button.setAttribute('aria-pressed', String(this._spotActive === i));
                button.addEventListener('keydown', (event) => this._pointKey(event, i, 'spot'));
                list.appendChild(button);
            });
            nodes.push(list);
        }
        const i = this._spotActive;
        if (i !== null && spots[i]) {
            nodes.push(this._arrowRow(hass, 'spot', (dir, mm) => this._moveSpot(i, dir, mm), () => this._removeSpot(i), translate(hass, 'punktBearbeiten', { n: i + 1 })));
            nodes.push(this._keyHint(hass, 'tastenPunkt'));
        }
        return nodes;
    }

    /** Arrow buttons (100 mm, Shift 500 mm) and optionally Remove, for a point or the Go-To target. */
    _arrowRow(hass, prefix, move, remove, label) {
        const row = document.createElement('div');
        row.className = 'task-edit';
        row.setAttribute('role', 'group');
        row.setAttribute('aria-label', label);
        for (const [dir, icon] of [['left', 'mdi:arrow-left'], ['up', 'mdi:arrow-up'], ['down', 'mdi:arrow-down'], ['right', 'mdi:arrow-right']]) {
            const name = translate(hass, 'nach_' + dir);
            const button = BuschUI.action({ label: name, icon, variant: 'secondary', onClick: (event) => move(dir, event && event.shiftKey ? 500 : 100) });
            button.setAttribute('data-action', prefix + '-' + dir);
            row.appendChild(button);
        }
        if (remove) row.appendChild(this._panelButton(hass, 'entfernen', 'mdi:close', prefix + '-remove', remove));
        return row;
    }

    /** Keys on a point entry: arrows move (Shift 500 mm), Delete removes, Escape deselects. */
    _pointKey(event, i, kind) {
        const dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[event.key];
        if (dir) {
            event.preventDefault();
            this._moveSpot(i, dir, event.shiftKey ? 500 : 100);
        } else if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            this._removeSpot(i);
        } else if (event.key === 'Escape' && this._spotActive === i) {
            event.preventDefault();
            this._spotActive = null;
            this._update();
        }
    }

    // ── Go-To (TASK-05) ───────────────────────────────────────────────────

    /** One target; refused targets are not set, the reason shows (R12). */
    _setGoto(p) {
        if (!p) return;
        const model = this._model();
        const target = { x: Math.round(p.x), y: Math.round(p.y) };
        const check = taskReady(model, 'goto', Object.assign(emptySelection(), { goto: target }), this._taskMap());
        if (!check.ok) {
            this._taskInfo = { key: check.reason, note: 'outside' };
            return this._update();
        }
        this._selection.goto = target;
        this._selectionChanged();
    }

    _moveGoto(dir, mm) {
        const t = this._selection.goto;
        if (!t) return;
        const d = this._zoneStep(dir, mm);
        this._setGoto({ x: t.x + d.x, y: t.y + d.y });
    }

    /** Saved target points of the map (`predefined_points`, dict or list of { x, y }). */
    _gotoPoints() {
        const raw = this._map ? this._map.current().objects.predefined_points : null;
        if (!raw || typeof raw !== 'object') return [];
        return Object.entries(raw).filter(([, p]) => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)))
            .map(([key, p], i) => ({ key: Array.isArray(raw) ? String(i + 1) : key, x: Number(p.x), y: Number(p.y) }));
    }

    _gotoPanel(hass, model) {
        const nodes = [];
        const target = this._selection.goto;
        if (!model.can('cruising')) {
            const note = this._note('task-note', 'mdi:information-outline', translate(hass, 'gotoSimuliert'));
            note.setAttribute('data-note', 'goto-simulated');
            nodes.push(note);
        }
        const tools = document.createElement('div');
        tools.className = 'task-tools';
        tools.appendChild(this._panelButton(hass, 'zielMitte', 'mdi:crosshairs', 'goto-centre', () => this._setGoto(this._mapCentre()), !this._mapCentre()));
        nodes.push(tools);
        const points = this._gotoPoints();
        if (points.length) {
            const list = document.createElement('div');
            list.className = 'task-list';
            list.setAttribute('role', 'group');
            list.setAttribute('aria-label', translate(hass, 'zielpunkte'));
            for (const p of points) {
                const text = translate(hass, 'zielpunktName', { n: p.key });
                const button = BuschUI.action({ label: text, text, icon: 'mdi:map-marker-star-outline', variant: 'secondary', onClick: () => this._setGoto(p) });
                button.classList.add('task-item');
                button.setAttribute('data-action', 'goto-point-' + p.key);
                button.setAttribute('aria-pressed', String(!!target && Math.round(p.x) === target.x && Math.round(p.y) === target.y));
                list.appendChild(button);
            }
            nodes.push(list);
        }
        if (target) {
            const list = document.createElement('div');
            list.className = 'task-list';
            const text = translate(hass, 'zielName', { x: target.x, y: target.y });
            const entry = BuschUI.action({ label: text, text, icon: 'mdi:map-marker-outline', variant: 'secondary', onClick: () => {} });
            entry.classList.add('task-item');
            entry.setAttribute('data-action', 'goto-target');
            entry.setAttribute('aria-pressed', 'true');
            entry.addEventListener('keydown', (event) => {
                const dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[event.key];
                if (dir) {
                    event.preventDefault();
                    this._moveGoto(dir, event.shiftKey ? 500 : 100);
                } else if (event.key === 'Enter') {
                    // Enter confirms the target: on to the one start button.
                    event.preventDefault();
                    const go = this._gotoBubble && this._gotoBubble.querySelector('[data-action="goto-start"]');
                    if (go) go.focus();
                } else if (event.key === 'Delete' || event.key === 'Backspace') {
                    event.preventDefault();
                    this._selection.goto = null;
                    this._selectionChanged();
                }
            });
            list.appendChild(entry);
            nodes.push(list);
            nodes.push(this._arrowRow(hass, 'goto', (dir, mm) => this._moveGoto(dir, mm), null, translate(hass, 'zielVerschieben')));
            nodes.push(this._keyHint(hass, 'tastenZiel'));
        }
        return nodes;
    }

    /** The target bubble at the bottom of the map (R04 fleeting, R23): the one way to start Go-To. */
    _renderGotoBubble(hass, model, shown, ready) {
        const target = this._selection.goto;
        if (!shown || !target || !this._map) {
            if (this._gotoBubble) this._gotoBubble.remove();
            this._gotoBubble = null;
            return;
        }
        if (!this._gotoBubble) {
            this._gotoBubble = document.createElement('div');
            this._gotoBubble.className = 'task-bubble';
            this._gotoBubble.setAttribute('role', 'group');
            this._gotoBubble.addEventListener('keydown', (event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                this._selection.goto = null;
                this._selectionChanged();
            });
        }
        const bubble = this._gotoBubble;
        bubble.setAttribute('aria-label', translate(hass, 'zielblase'));
        const text = document.createElement('span');
        text.className = 'task-bubble-text';
        // Short on a phone: the coordinates stand in the target entry below the map.
        text.textContent = translate(hass, 'zielblase');
        const label = translate(hass, 'hierhinFahren');
        const busy = !!this._pending;
        const go = BuschUI.action({ label, text: busy ? translate(hass, 'wirdGestartet') : label, icon: 'mdi:navigation-variant-outline', variant: 'primary', disabled: !ready.ok || busy,
            onClick: () => this._startTask(model.state) });
        go.setAttribute('data-action', 'goto-start');
        if (!ready.ok) go.setAttribute('aria-describedby', 'task-hint');
        const clear = BuschUI.action({ label: translate(hass, 'zielVerwerfen'), icon: 'mdi:close', variant: 'icon-only', onClick: () => {
            this._selection.goto = null;
            this._selectionChanged();
        } });
        clear.setAttribute('data-action', 'goto-clear');
        bubble.replaceChildren(text, go, clear);
        if (bubble.parentNode !== this._map.region) this._map.region.appendChild(bubble);
    }

    /** Taps on own targets: × first, then handles (44 px), then the area or point. */
    _hitSelection(point) {
        const model = this._model();
        const task = this._chosenTask(model);
        const c = this._client(point);
        if (!c) return null;
        const near = (q) => q && Math.hypot(q.x - c.x, q.y - c.y) <= HANDLE_PX;
        if (task === 'spot') {
            const spots = this._selection.spots;
            for (let i = spots.length - 1; i >= 0; i--) if (near((this._spotHandles(i) || {}).remove)) return { id: 'spot-remove:' + i, object: spots[i] };
            for (let i = spots.length - 1; i >= 0; i--) if (near((this._spotHandles(i) || {}).point)) return { id: 'spot:' + i, object: spots[i] };
            return null;
        }
        if (task !== 'zone') return null;
        const zones = this._selection.zones;
        for (let i = zones.length - 1; i >= 0; i--) {
            const h = this._zoneHandles(i);
            if (!h) continue;
            if (near(h.remove)) return { id: 'zone-remove:' + i, object: zones[i] };
            // A small zone on a phone: its centre lies within a corner's reach; the nearer of the two wins (move vs scale).
            const centre = this._client({ x: (zones[i].x0 + zones[i].x1) / 2, y: (zones[i].y0 + zones[i].y1) / 2 });
            const dist = (q) => Math.hypot(q.x - c.x, q.y - c.y);
            const j = h.corners.findIndex((q) => near(q) && dist(q) < dist(centre));
            if (j >= 0) return { id: 'zone-corner:' + i + ':' + j, object: zones[i] };
        }
        for (let i = zones.length - 1; i >= 0; i--) {
            const z = zones[i];
            if (point.x >= Math.min(z.x0, z.x1) && point.x <= Math.max(z.x0, z.x1) && point.y >= Math.min(z.y0, z.y1) && point.y <= Math.max(z.y0, z.y1)) return { id: 'zone:' + i, object: z };
        }
        return null;
    }

    /** Draws the own selection into the layer `tasks` (shape + number, R17). */
    _drawSelection(group, ctx) {
        const task = this._chosenTask(ctx.model);
        if (task === 'goto' && this._selection.goto) {
            const g = group.appendChild(screenMark(ctx, this._selection.goto, { 'data-select': 'goto' }));
            g.appendChild(ctx.svgNode('path', { d: 'M0 0 C-6 -8 -9 -12 -9 -17 A9 9 0 0 1 9 -17 C9 -12 6 -8 0 0 Z' }));
            g.appendChild(ctx.svgNode('circle', { cy: -17, r: 3.5 }));
            return;
        }
        if (task === 'spot') {
            const map = this._taskMap();
            this._selection.spots.forEach((p, i) => {
                const outside = !!map && map.passable(p) === false;
                group.appendChild(ctx.svgNode('polygon', { 'data-select': 'spot', 'data-spot': i, 'data-invalid': String(outside), 'data-chosen': String(this._spotActive === i), points: boxPoints(ctx, spotBox(p)) }));
                const g = group.appendChild(screenMark(ctx, p, { 'data-handle': 'point' }));
                g.appendChild(ctx.svgNode('circle', { r: 8 }));
                g.appendChild(ctx.svgNode('text', { 'text-anchor': 'middle', y: 4, 'font-size': 11 })).textContent = String(i + 1);
                const x = g.appendChild(ctx.svgNode('g', { 'data-handle': 'remove', transform: 'translate(18 -18)' }));
                x.appendChild(ctx.svgNode('circle', { r: 11 }));
                x.appendChild(ctx.svgNode('path', { d: 'M-4 -4 L4 4 M4 -4 L-4 4' }));
            });
            return;
        }
        if (task === 'zone') {
            const map = this._taskMap();
            this._selection.zones.forEach((z, i) => {
                const outside = !!map && zoneSamples(z).every((p) => map.passable(p) === false);
                group.appendChild(ctx.svgNode('polygon', { 'data-select': 'zone', 'data-zone': i, 'data-invalid': String(outside), 'data-chosen': String(this._zoneActive === i), points: boxPoints(ctx, z) }));
                const label = group.appendChild(screenMark(ctx, { x: (z.x0 + z.x1) / 2, y: (z.y0 + z.y1) / 2 }, { 'data-select': 'zone-label' }));
                label.appendChild(ctx.svgNode('text', { 'text-anchor': 'middle', y: 5, 'font-size': 14 })).textContent = String(i + 1) + (outside ? ' !' : '');
                const h = this._zoneHandles(i);
                [[z.x0, z.y0], [z.x1, z.y0], [z.x1, z.y1], [z.x0, z.y1]].forEach(([x, y], j) => {
                    const g = group.appendChild(screenMark(ctx, { x, y }, { 'data-handle': 'corner' }));
                    g.appendChild(ctx.svgNode('circle', { r: 8 }));
                    if (h && j === h.k) {
                        const x = g.appendChild(ctx.svgNode('g', { 'data-handle': 'remove', transform: 'translate(18 -18)' }));
                        x.appendChild(ctx.svgNode('circle', { r: 11 }));
                        x.appendChild(ctx.svgNode('path', { d: 'M-4 -4 L4 4 M4 -4 L-4 4' }));
                    }
                });
            });
            return;
        }
        if (task === 'room') {
            const order = this._roomOrder(ctx.model);
            for (const id of this._selection.rooms) {
                const room = ctx.rooms[id];
                if (!room || room.x === undefined) continue;
                const g = group.appendChild(screenMark(ctx, room, { 'data-select': 'room', 'data-room': id }));
                g.appendChild(ctx.svgNode('circle', { r: 11, cy: 22 }));
                g.appendChild(ctx.svgNode('text', { 'text-anchor': 'middle', y: 26.5, 'font-size': 12 })).textContent = String(order.indexOf(id) + 1);
            }
        }
    }

    /** Start of the chosen task: exactly one service (spec table), optimistic, one call per tap (R11). */
    _startTask(real) {
        if (this._pending) return;
        const model = this._model();
        const task = this._chosenTask(model);
        if (!taskReady(model, task, this._selection, this._taskMap()).ok) return;
        const call = taskPayload(model, task, this._selection, this._repeats);
        this._taskError = null;
        this._run = { at: Date.now(), stopped: false, seen: false };
        this._call('start', real, Object.assign({ task }, call));
    }

    /**
     * TASK-01: back to "All" with an empty selection only at a natural end of
     * a task this card started — the newest history entry since the start says
     * completed (the integration loads it at status completed, device.py#L1889).
     * Own stop: never. Without the history sensor: unless the card stopped it.
     */
    _checkEnd(model, active) {
        const run = this._run;
        if (!run) return;
        if (active) {
            run.seen = true;
            return;
        }
        if (!run.seen) return;
        if (run.stopped) {
            this._run = null;
            return;
        }
        const id = model.entity('sensor.cleaning_history');
        const history = id && this._hass.states[id];
        if (history) {
            const since = Object.values(history.attributes || {}).filter((e) => e && typeof e === 'object' && Number(e.timestamp) * 1000 >= run.at - 60000);
            // The history comes a few seconds after the end: until then the type stays.
            if (!since.length) return;
            this._run = null;
            const newest = since.reduce((a, b) => (Number(b.timestamp) > Number(a.timestamp) ? b : a));
            if (newest.completed !== true) return;
        } else this._run = null;
        this._task = 'all';
        this._selection = emptySelection();
    }

    _note(className, icon, text) {
        const node = document.createElement('div');
        node.className = className;
        if (className === 'task-hint') node.id = 'task-hint';
        const symbol = BuschUI.ha.icon(icon);
        symbol.setAttribute('aria-hidden', 'true');
        const span = document.createElement('span');
        span.textContent = text;
        node.append(symbol, span);
        return node;
    }

    /** Messages (CORE-10): level as word and colour (R17); wiped ones stay away until they change. */
    _renderMessages(hass, model) {
        const list = messagesFor(hass, model).filter((m) => !this._hidden(m.kind + '_message'));
        for (const [kind, text] of this._dismissed) if (!list.some((m) => m.kind === kind && m.text === text)) this._dismissed.delete(kind);
        const nodes = list.filter((m) => this._dismissed.get(m.kind) !== m.text).map((m) => {
            const look = MESSAGE_LOOK[m.kind];
            const node = document.createElement('div');
            node.className = 'message';
            node.setAttribute('data-kind', m.kind);
            node.setAttribute('role', m.kind === 'error' ? 'alert' : 'status');
            const symbol = BuschUI.ha.icon(look.icon);
            symbol.setAttribute('aria-hidden', 'true');
            const body = document.createElement('div');
            body.className = 'message-text';
            const word = document.createElement('strong');
            word.textContent = translate(hass, look.word);
            const text = document.createElement('span');
            text.textContent = m.text;
            body.append(word, text);
            node.append(symbol, body);
            if (m.kind === 'warning' && model.can('clear_warning')) {
                const clear = BuschUI.action({ label: translate(hass, 'warnungLoeschen'), icon: 'mdi:broom', variant: 'quiet', onClick: () => this._clearWarning(model) });
                clear.setAttribute('data-action', 'clear');
                node.appendChild(clear);
            }
            const dismiss = BuschUI.action({ label: translate(hass, 'ausblenden'), icon: 'mdi:close', variant: 'quiet', onClick: () => { this._dismissed.set(m.kind, m.text); this._update(); } });
            dismiss.setAttribute('data-action', 'dismiss');
            node.appendChild(dismiss);
            return node;
        });
        this._messages.replaceChildren(...nodes);
    }

    _clearWarning(model) {
        const button = model.entity('button.clear_warning');
        if (button) this._hass.callService('button', 'press', { entity_id: button });
        else this._hass.callService('dreame_vacuum', 'vacuum_clear_warning', { entity_id: this._opts.entity });
    }

    _metric(name, labelKey, value, icon) {
        const node = BuschUI.metric(translate(this._hass, labelKey), value);
        node.setAttribute('data-metric', name);
        const symbol = BuschUI.ha.icon(icon);
        symbol.setAttribute('aria-hidden', 'true');
        node.appendChild(symbol);
        return node;
    }

    /** Station status as the dock button (DOCK-05): colour AND text (R17), opens the station menu. */
    _dock(hass, model) {
        const status = dockStatus(model);
        const words = translate(hass, 'station') + (status.key ? ' · ' + translate(hass, status.key) : '');
        const node = BuschUI.action({ label: words, icon: status.level === 'ok' ? 'mdi:home-variant-outline' : 'mdi:home-alert-outline', variant: 'secondary',
            onClick: () => this._openDialog(stationMenu(this)) });
        node.classList.add('dock');
        node.setAttribute('aria-haspopup', 'menu');
        node.setAttribute('data-action', 'dock');
        node.setAttribute('data-dock', status.level);
        const text = document.createElement('span');
        text.textContent = words;
        node.appendChild(text);
        return node;
    }

    /** One control or task start; `call` ({ task, domain, service, data }) replaces the vacuum service. */
    _call(name, real, call) {
        const control = CONTROLS[name];
        this._haptic();
        this._endPending();
        if ((name === 'stop' || name === 'return') && this._run) this._run.stopped = true;
        const pending = { state: control.target, from: real ? real.state : null, timer: null };
        pending.timer = setTimeout(() => {
            if (this._pending === pending) { this._pending = null; this._update(); }
        }, OPTIMISTIC_HOLD_MS);
        this._pending = pending;
        const data = Object.assign({ entity_id: this._opts.entity }, call ? call.data : {});
        Promise.resolve(this._hass.callService(call ? call.domain : 'vacuum', call ? call.service : control.service, data)).catch((error) => {
            if (call) {
                // R12: what failed and why; the selection stays for the next try.
                this._run = null;
                const type = TASK_TYPES.find((t) => t.name === call.task);
                this._taskError = translate(this._hass, 'aufgabeFehler', { task: translate(this._hass, type ? type.text : 'taskAll'), grund: errorText(error) });
            }
            if (this._pending === pending) this._endPending();
            this._update();
        });
        this._update();
    }

    _endPending() {
        if (this._pending) clearTimeout(this._pending.timer);
        this._pending = null;
    }
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

const EDITOR_STYLES = BuschUI.editorStyles;

/** The schema with the select options named in the user's language. */
const OPTION_PREFIX = { locked: 'lock_', hidden_card_objects: 'obj_', map_display: 'display_', color_scheme: 'scheme_', icon_set: 'icons_', hidden_objects: 'mapobj_' };

function localSchema(hass, schema = SCHEMA_BUSCH_VACUUM_CARD) {
    return schema.map((field) => {
        if (field.schema) return Object.assign({}, field, { schema: localSchema(hass, field.schema) });
        const select = field.selector && field.selector.select;
        if (!select) return field;
        const options = select.options.map((value) => ({ value, label: field.name === 'rotation' ? value + '°' : translate(hass, OPTION_PREFIX[field.name] + value) }));
        return Object.assign({}, field, { selector: { select: Object.assign({}, select, { options }) } });
    });
}

/** The schema with one map_config block per floor of the vacuum's `maps` (MAP-06/07). */
function editorSchema(hass, maps) {
    const floors = maps.map((m) => ({ name: 'map_' + m.index, type: 'expandable', icon: 'mdi:layers-outline', schema: MAP_CONFIG_FIELDS }));
    const fill = (schema) => schema.map((f) => (f.name === 'map_config' ? Object.assign({}, f, { schema: floors }) : f.schema ? Object.assign({}, f, { schema: fill(f.schema) }) : f));
    return localSchema(hass, fill(SCHEMA_BUSCH_VACUUM_CARD));
}

class BuschVacuumCardEditor extends BuschUI.EditorBase {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        BuschUI.guardEditorKeys(this.shadowRoot);
        this._config = {};
        this._hass = null;
        this._form = null;
    }

    setConfig(config) {
        if (!this._acceptConfig(config || {})) return;
        this._render();
    }

    set hass(hass) {
        const language = BuschUI.language(hass, { legacy: true });
        // Missing scripts are part of a helper text: a change rebuilds the form like the floors.
        const floors = JSON.stringify(this._maps(hass)) + this._missingScripts(hass);
        const relabel = language !== this._language || floors !== this._floors;
        this._hass = hass;
        this._language = language;
        this._floors = floors;
        if (!this._form) this._render();
        else {
            this._form.hass = hass;
            // Option names and floors are part of the schema; a new hass each state change must not rebuild it.
            if (relabel) this._render();
        }
    }

    /** Configured scripts Home Assistant does not know (left out of the menu), as text. */
    _missingScripts(hass = this._hass) {
        const scripts = Array.isArray(this._config && this._config.scripts) ? this._config.scripts : [];
        return hass && hass.states ? scripts.filter((id) => !hass.states[id]).join(', ') : '';
    }

    /** Floors of the chosen vacuum (`maps`: id, index, name, custom_name). */
    _maps(hass = this._hass) {
        const id = this._config && this._config.entity;
        const state = hass && hass.states && id ? hass.states[id] : null;
        const maps = state && state.attributes.maps;
        return Array.isArray(maps) ? maps.filter((m) => m && m.index !== undefined).map((m) => ({ index: m.index, name: m.custom_name || m.name || String(m.index) })) : [];
    }

    get hass() {
        return this._hass;
    }

    connectedCallback() {
        this._render();
    }

    _render() {
        if (!this._form) {
            this.shadowRoot.innerHTML = '';
            const style = document.createElement('style');
            style.textContent = EDITOR_STYLES;
            this.shadowRoot.appendChild(style);
            const form = BuschUI.ha.form();
            const floor = (name) => this._maps().find((m) => 'map_' + m.index === name);
            form.computeLabel = (item) => {
                const f = item.name && floor(item.name);
                if (f) return translate(this._hass, 'stockwerkLabel', { name: f.name });
                return item.name ? fieldLabel(this._hass, item.name) : '';
            };
            form.computeHelper = (item) => {
                if (item.name && floor(item.name)) return translate(this._hass, 'stockwerkHelfer');
                if (item.name === 'scripts' && this._missingScripts()) return fieldHelper(this._hass, 'scripts') + ' ' + translate(this._hass, 'skripteFehlen', { liste: this._missingScripts() });
                return item.name ? fieldHelper(this._hass, item.name) : '';
            };
            form.addEventListener('value-changed', (event) => {
                event.stopPropagation();
                const next = BuschUI.updateConfig(this._config, event.detail.value || {});
                // Only what differs from the defaults: the YAML stays as short as a hand-written one.
                pruneMapOptions(next);
                for (const [key, standard] of Object.entries(EDITOR_DEFAULTS)) {
                    if (next[key] === undefined || next[key] === null || BuschUI.configsEqual(next[key], standard)) delete next[key];
                }
                next.type = 'custom:' + CARD_TAG;
                this._publishConfig(next);
            });
            this.shadowRoot.appendChild(form);
            this._form = form;
        }
        this._form.hass = this._hass;
        const maps = this._maps();
        this._form.schema = editorSchema(this._hass, maps);
        const data = Object.assign(BuschUI.cloneConfig(EDITOR_DEFAULTS), BuschUI.cloneConfig(this._config));
        // Each floor shows its defaults; unchanged ones are pruned on write.
        data.map_config = Object.fromEntries(maps.map((m) => ['map_' + m.index, Object.assign(BuschUI.cloneConfig(MAP_EDITOR_DEFAULTS), BuschUI.cloneConfig((this._config.map_config || {})['map_' + m.index] || {}))]));
        this._form.data = data;
    }
}

// ---------------------------------------------------------------------------
// Remote control (remote): one sender, sliders, hold buttons and keys feed it (R08)
// ---------------------------------------------------------------------------

/**
 * Limits and timing in one place. The integration documents forward 100,
 * backward −300 and rotation ±128; backward stays at −100 (no collision
 * guard reversing) until the first live run calibrates (spec open question 1).
 */
const REMOTE = { forward: 100, backward: -100, rotation: 128, deadzone: 0.15, stepMs: 200, stopRepeatMs: 300, timeoutMs: 2000 };

/** A stick or key value −1…1 → service value: dead zone, linear to the limit; Shift halves speed, Ctrl turning, precision both. */
function remoteValue(axis, raw, mods = {}) {
    const x = Math.max(-1, Math.min(1, Number(raw) || 0));
    if (Math.abs(x) <= REMOTE.deadzone) return 0;
    const share = (Math.abs(x) - REMOTE.deadzone) / (1 - REMOTE.deadzone);
    const limit = axis === 'velocity' ? (x > 0 ? REMOTE.forward : -REMOTE.backward) : REMOTE.rotation;
    const half = mods.precision || (axis === 'velocity' ? mods.shift : mods.ctrl);
    return Math.sign(x) * Math.round(share * limit * (half ? 0.5 : 1)) || 0;
}

/**
 * The only way a move reaches the robot. The integration neither queues nor
 * drops, so parallel calls would overtake each other at the device: one call
 * at a time, the next after its answer and ≥ stepMs after the previous, always
 * the newest value. Stop goes next without spacing and once more after
 * stopRepeatMs. An error or no answer within timeoutMs ends moving (state
 * `error`) and tries to stop. `state`: idle, moving, stopping, stopped, error.
 */
class RemoteSender {
    constructor(hass, entityId, onChange) {
        this._hass = hass;
        this._entity = entityId;
        this._onChange = onChange || (() => {});
        this.state = 'idle';
        this.error = null;
        this._want = null; // { v, r } held now
        this._stop = false; // a stop is due
        this._round = 0; // stops sent in this stop sequence
        this._dirty = false; // a move went out since the last complete stop
        this._busy = null; // { seq, timer } of the call in flight
        this._seq = 0;
        this._last = -Infinity;
        this._timer = null; // spacing or the stop repeat
    }

    set({ v, r }) {
        if (!v && !r) return this.stop('release');
        if (this.state === 'error') return;
        this._want = { v, r };
        this._stop = false;
        this._round = 0;
        this._to('moving');
        this._pump();
    }

    stop() {
        this._want = null;
        if (this._stop || this._round) return; // a stop sequence is already under way; its repeat stays at stopRepeatMs
        if (!this._dirty) {
            clearTimeout(this._timer);
            if (this.state === 'moving') this._to('stopped');
            return;
        }
        this._stop = true;
        this._pump();
    }

    /** After an error: arming again starts clean. */
    reset() {
        this.error = null;
        if (this.state === 'error') this._to('idle');
    }

    _to(state) {
        if (this.state === state) return;
        this.state = state;
        this._onChange(state);
    }

    _pump() {
        if (this._busy) return;
        clearTimeout(this._timer);
        this._timer = null;
        if (this._stop) return this._send(0, 0, true);
        if (!this._want || this.state === 'error') return;
        const wait = this._last + REMOTE.stepMs - Date.now();
        if (wait > 0) this._timer = setTimeout(() => this._pump(), wait);
        else this._send(this._want.v, this._want.r, false);
    }

    _send(v, r, stop) {
        const seq = ++this._seq, at = Date.now();
        this._last = at;
        if (stop) {
            this._stop = false;
            this._round += 1;
            if (this.state !== 'error') this._to('stopping');
        } else this._dirty = true;
        const done = (error) => {
            if (!this._busy || this._busy.seq !== seq) return;
            clearTimeout(this._busy.timer);
            this._busy = null;
            if (error) {
                this.error = error;
                this._want = null;
                this._to('error');
                if (!stop) this._stop = true;
            }
            if (stop && !this._want && !this._stop) {
                if (this._round === 1) {
                    // A lost stop is the worst case: once more, a little later.
                    this._timer = setTimeout(() => { this._stop = true; this._pump(); }, Math.max(0, at + REMOTE.stopRepeatMs - Date.now()));
                    return;
                }
                this._dirty = false;
                this._round = 0;
                if (this.state !== 'error') this._to('stopped');
                return;
            }
            this._pump();
        };
        // No answer in time counts as lost: the stop attempt then goes out although the call still hangs.
        this._busy = { seq, timer: setTimeout(() => done('timeout'), REMOTE.timeoutMs) };
        let call;
        try {
            call = Promise.resolve(this._hass().callService('dreame_vacuum', 'vacuum_remote_control_move_step', { entity_id: this._entity, velocity: v, rotation: r }));
        } catch (e) {
            call = Promise.reject(e);
        }
        call.then(() => done(null), (e) => done(errorText(e)));
    }
}

/** Why remote control is refused right now (R18), or null. The device refuses mop washing and fast mapping itself. */
function remoteBlock(model, hass) {
    if (hass && hass.connected === false) return 'connection';
    if (!model.state || UNUSABLE.includes(model.state.state)) return 'unavailable';
    if (model.state.state === 'error') return 'error';
    if (model.attr('washing')) return 'washing';
    if (model.attr('mapping')) return 'mapping';
    return null;
}

/**
 * The remote view (REM-01…03). It opens unarmed; only "Start control" lets
 * input through, anew on every opening. Its DOM is built once per opening and
 * never redrawn by state updates (`watch` is empty, `update` repaints in place),
 * so a held stick keeps its pointer. Every loss of control stops: release,
 * blur, hidden tab, leaving the view, an error, a lost connection.
 */
function remoteView(card) {
    const view = { title: translate(card._hass, 'entryRemote'), kind: 'editor', watch: () => [] };
    // R21 on purpose: arming lives only while the view is open; a remembered arming would let a stray touch move the robot.
    const ctl = view.remote = { armed: false, note: null, block: null, moving: false, sources: new Map(), mods: {}, precision: false, root: null, parts: {}, listening: false };
    const hass = () => card._hass;
    const text = (key, vars) => translate(hass(), key, vars);
    ctl.sender = new RemoteSender(hass, card._opts.entity, () => {
        if (ctl.sender.state === 'error' && ctl.armed) {
            const reason = ctl.sender.error === 'timeout' ? text('remoteZeit') : ctl.sender.error;
            disarm(text('remoteFehler', { grund: reason }));
        }
        paint();
    });

    /** The one input of sticks, hold buttons and keys (R08): axes −1…1 per source, v forward, t left. */
    ctl.input = (source, axes) => {
        if (axes) ctl.sources.set(source, axes);
        else ctl.sources.delete(source);
        drive();
    };
    const sum = (key) => Math.max(-1, Math.min(1, [...ctl.sources.values()].reduce((s, a) => s + (a[key] || 0), 0)));
    const drive = () => {
        if (!ctl.armed) return;
        const mods = Object.assign({ precision: ctl.precision }, ctl.mods);
        const v = remoteValue('velocity', sum('v'), mods);
        // shortcut: positive rotation = left (counter-clockwise) is assumed from the docs; live run 2 confirms the sign.
        const r = remoteValue('rotation', sum('t'), mods);
        const moving = !!(v || r);
        if (moving !== ctl.moving) card._haptic(); // leaving the dead zone and stopping
        ctl.moving = moving;
        if (moving) ctl.sender.set({ v, r });
        else ctl.sender.stop();
        paint();
    };
    /** Auto-stop: all input released at once. */
    const halt = () => {
        ctl.sources.clear();
        if (ctl.moving) card._haptic();
        ctl.moving = false;
        ctl.sender.stop();
        paint();
    };
    const disarm = (note) => {
        halt();
        ctl.armed = false;
        ctl.note = note;
        paint();
    };
    ctl.halt = halt;
    const arm = () => {
        if (ctl.block) return;
        ctl.sender.reset();
        ctl.note = null;
        ctl.armed = true;
        paint();
    };

    const onBlur = () => halt();
    const onVisibility = () => { if (document.hidden) halt(); };
    const listen = (on) => {
        if (ctl.listening === on) return;
        ctl.listening = on;
        const method = on ? 'addEventListener' : 'removeEventListener';
        window[method]('blur', onBlur);
        document[method]('visibilitychange', onVisibility);
    };
    view.leave = () => {
        ctl.armed = false;
        halt();
        listen(false);
    };

    const stateName = () => {
        if (ctl.block) return 'blocked';
        if (!ctl.armed) return 'unarmed';
        const s = ctl.sender.state;
        return s === 'moving' || s === 'stopping' || s === 'stopped' ? s : 'ready';
    };
    const paint = () => {
        const p = ctl.parts;
        if (!ctl.root) return;
        const state = stateName();
        ctl.root.setAttribute('data-state', state);
        p.status.textContent = text('remoteStatus_' + state);
        p.blocked.hidden = !ctl.block;
        p.blocked.textContent = ctl.block ? text('remoteGesperrt_' + ctl.block) : '';
        p.note.hidden = !ctl.note;
        p.note.textContent = ctl.note || '';
        p.arm.hidden = ctl.armed;
        p.arm.disabled = !!ctl.block;
    };
    const line = (cls, role) => {
        const node = document.createElement('p');
        node.className = cls;
        if (role) node.setAttribute('role', role);
        return node;
    };
    const build = () => {
        const root = document.createElement('div');
        root.className = 'remote';
        const p = ctl.parts;
        p.warning = line('remote-warning form-note');
        p.warning.setAttribute('data-kind', 'warning');
        p.warning.textContent = text('remoteWarnung');
        p.status = line('remote-status', 'status');
        p.blocked = line('remote-blocked form-note', 'status');
        p.note = line('remote-note form-note', 'alert');
        p.note.setAttribute('data-kind', 'error');
        const actions = document.createElement('div');
        actions.className = 'remote-actions';
        p.arm = BuschUI.action({ label: text('remoteStarten'), text: text('remoteStarten'), icon: 'mdi:gamepad-round-outline', variant: 'primary', onClick: () => arm() });
        p.arm.setAttribute('data-action', 'arm');
        p.stop = BuschUI.action({ label: text('remoteStopp'), text: text('remoteStopp'), icon: 'mdi:stop', onClick: () => halt() });
        p.stop.setAttribute('data-action', 'stop');
        actions.append(p.arm, p.stop);
        root.append(p.warning, p.status, p.blocked, p.note, actions);
        ctl.root = root;
    };

    view.update = (h) => {
        const block = remoteBlock(card._model(), h);
        if (block && !ctl.block && (ctl.armed || ctl.moving)) disarm(block === 'connection' ? text('remoteVerbindung') : null);
        ctl.block = block;
        paint();
    };
    view.render = (body, h) => {
        if (!ctl.root) build();
        listen(true);
        body.appendChild(ctl.root);
        view.update(h);
    };
    return view;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

BuschVacuumCard.__internals = {
    TEXTE: TEXTE_BUSCH_VACUUM_CARD,
    SCHEMA: SCHEMA_BUSCH_VACUUM_CARD,
    normalizeConfig,
    MAP_CONFIG_FIELDS,
    findRelated,
    VacuumModel,
    SETTINGS,
    SETTING_GROUPS,
    STATION_TABS,
    stationStatus,
    shortcutEntries,
    dockStatus,
    settingState,
    settingRow,
    MODULE_VIEWS,
    ROOM_KEYS,
    roomPayload,
    sequenceModel,
    moveRoom,
    daysOfMask,
    maskOfDays,
    maskOfRepeats,
    repeatsOfMask,
    scheduleValue,
    writeSetting,
    callAction,
    DIALOG_STYLES,
    CARD_STYLES,
    clockText,
    firstWeekday,
    decodeMapData,
    roomAtGrid,
    roomAtRects,
    passableGrid,
    affineFrom,
    invertAffine,
    applyAffine,
    multiplyAffine,
    gridAffine,
    viewMatrix,
    paintMapPixels,
    parseColor,
    taskPayload,
    taskReady,
    historyRuns,
    historySums,
    historyUrl,
    recleanState,
    REMOTE,
    remoteValue,
    RemoteSender,
    remoteBlock,
    version: CARD_VERSION
};

if (!customElements.get(CARD_TAG)) customElements.define(CARD_TAG, BuschVacuumCard);
if (!customElements.get(EDITOR_TAG)) customElements.define(EDITOR_TAG, BuschVacuumCardEditor);
if (!customElements.get(DIALOG_TAG)) customElements.define(DIALOG_TAG, BuschVacuumDialog);

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === CARD_TAG)) {
    // Read at load time, before `hass` exists: the browser language decides.
    const picker = textTable(null);
    window.customCards.push({
        type: CARD_TAG,
        name: picker.name,
        description: picker.description,
        preview: true,
        documentationURL: 'https://github.com/luukkii123/ha-busch-vacuum-card'
    });
}

console.info(
    `%c BUSCH-VACUUM-CARD %c ${CARD_VERSION} `,
    'color: #111; background: #8fd3ff; font-weight: 700;',
    'color: #8fd3ff; background: #111;'
);
