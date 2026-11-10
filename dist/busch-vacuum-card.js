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
            brauchtKarte: '„{task}“ braucht die Karte. Die Kartenansicht folgt in einem späteren Ausbau; bis dahin geht nur „Gesamt“.',
            aufgabeLaeuft: 'Aufgabe läuft',
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
            keineZeitraeume: 'Keine Zeiträume. Lege einen an, damit der Roboter in dieser Zeit leise bleibt.',
            zeitraumNeu: 'Zeitraum hinzufügen',
            zeitraumBearbeiten: 'Zeitraum bearbeiten',
            feld_start: 'Beginn',
            feld_end: 'Ende',
            feld_days: 'Tage',
            fehlerZeit: 'Pflichtfeld: Uhrzeit im Format HH:MM.',
            fehlerGleich: 'Ende muss sich vom Beginn unterscheiden.',
            fehlerTage: 'Mindestens einen Tag wählen.',
            ungespeichert: 'Änderungen sind noch nicht gespeichert.',
            verwerfen: 'Verwerfen',
            speichern: 'Speichern',
            loeschen: 'Löschen',
            zeitraumLoeschenTitel: 'Zeitraum löschen?',
            zeitraumLoeschenFrage: 'Zeitraum {zeitraum} ({tage}) endgültig löschen?',
            treffer: '{n} Treffer',
            keineTreffer: 'Keine Einstellung gefunden. Versuche einen anderen Begriff.'
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
            brauchtKarte: '“{task}” needs the map. The map view follows in a later update; until then only “All” works.',
            aufgabeLaeuft: 'Task running',
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
            keineZeitraeume: 'No periods. Create one to keep the robot quiet during that time.',
            zeitraumNeu: 'Add period',
            zeitraumBearbeiten: 'Edit period',
            feld_start: 'Start',
            feld_end: 'End',
            feld_days: 'Days',
            fehlerZeit: 'Required: time as HH:MM.',
            fehlerGleich: 'End must differ from start.',
            fehlerTage: 'Choose at least one day.',
            ungespeichert: 'Changes are not saved yet.',
            verwerfen: 'Discard',
            speichern: 'Save',
            loeschen: 'Delete',
            zeitraumLoeschenTitel: 'Delete period?',
            zeitraumLoeschenFrage: 'Permanently delete period {zeitraum} ({tage})?',
            treffer: '{n} results',
            keineTreffer: 'No setting found. Try another term.'
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
            case 'dock': return this.caps.has('self_wash_base') || this.caps.has('auto_empty_base');
            case 'history': return !!this.entity('sensor.cleaning_history');
            // CORE-10: the button is what v2.0.3 offers; the documented service only if present.
            case 'clear_warning': return !!this.entity('button.clear_warning') || this.can('dreame_vacuum.vacuum_clear_warning');
            case 'consumables': return Object.keys(this.consumables()).length > 0;
            case 'remote': return this.can('dreame_vacuum.vacuum_remote_control_move_step');
            case 'settings': return this.can('dreame_vacuum.vacuum_set_property');
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
    { name: 'station', icon: 'mdi:home-variant-outline', module: 'dock' },
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
        select: ['mop_extend_frequency', 'mop_pad_swing', 'mopping_type', 'custom_mopping_route', 'mop_pressure', 'mop_temperature',
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
        select: ['suction_level', 'water_volume', 'cleaning_mode', 'mop_pad_humidity', 'cleaning_route', 'cleangenius', 'cleangenius_mode'],
        number: ['wetness_level']
    }
};

/** Ranges as `set_property_value` checks them (device.py#L2930ff), and the rows that need more than a value. */
const SETTING_EXTRA = {
    volume: { min: 0, max: 100 },
    camera_light_brightness: { min: 40, max: 100 },
    mop_cleaning_remainder: { min: 0, max: 180 },
    wetness_level: { min: 1, max: 32 },
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
    manualLight: ['camera_light_brightness']
};

const SETTINGS = {};
for (const [group, controls] of Object.entries(SETTING_KEYS)) {
    for (const [control, keys] of Object.entries(controls)) {
        for (const key of keys) SETTINGS[key] = Object.assign({ group, control, platform: control, needs: [] }, SETTING_EXTRA[key]);
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
    manualLight: (model) => settingValue(model, 'camera_light_brightness').value !== 101
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
        : def.control === 'select' && options && !options.length ? translate(hass, 'sperre_liste') : '';
    return {
        key, def, entityId, options,
        label: settingLabel(hass, key),
        present: current.source !== null && !(def.replacedBy && model.can(def.replacedBy)),
        source: current.source,
        value,
        known: value !== undefined,
        min: def.min !== undefined ? def.min : entity ? entity.attributes.min : undefined,
        max: def.max !== undefined ? def.max : entity ? entity.attributes.max : undefined,
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
function trackWrite(card, key, { want, check, call, label, done }) {
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
    }, (error) => fail(translate(card._hass, 'schreibFehler', { name, grund: errorText(error) })));
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
function callAction(card, key, value, { track = key, label, done } = {}) {
    const data = { entity_id: card._opts.entity, key };
    if (value !== undefined) data.value = String(value);
    return trackWrite(card, track, { label, done, call: () => card._hass.callService('dreame_vacuum', 'vacuum_call_action', data) });
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
    if (model.attr('segment_cleaning')) return 'room';
    if (model.attr('zone_cleaning')) return 'zone';
    if (model.attr('spot_cleaning')) return 'spot';
    return 'all';
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
    { name: 'cruising_history', text: 'entryCruising', icon: 'mdi:map-marker-path', needs: 'cruising', module: 'history' },
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
            const [x, y, w, h, , , angle] = f.map(Number);
            const rad = (angle || 0) * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
            const corners = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([dx, dy]) => ({ x: x + dx * cos - dy * sin, y: y + dx * sin + dy * cos }));
            group.appendChild(view.svgNode('polygon', { 'data-object': i, points: toPoints(view, corners) }));
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
    _roomTap(id, source) {
        this._emit('map-room-tap', { room: id, source, mode: this._mode });
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
                onClick: () => {
                    if (onToggle) onToggle(Number(id));
                    if (list === this.chips) this._roomTap(Number(id), 'chip');
                    else this._emit('map-room-tap', { room: Number(id), source: 'chip', mode: this._mode });
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
        const rooms = this._showsMap() ? this.current().rooms : {};
        const key = JSON.stringify([rooms, this._highlight, BuschUI.language(this.hass, { legacy: true })]);
        if (key === this._chipsKey) return;
        this._chipsKey = key;
        const root = this.card.shadowRoot;
        const active = root && root.activeElement;
        const focusedRoom = active && active.getAttribute ? active.getAttribute('data-room') : null;
        // The cleaning sequence as on the map's badges (R01).
        const order = Object.entries(rooms).filter(([, r]) => Number(r && r.order) > 0).sort((x, y) => x[1].order - y[1].order).map(([id]) => id);
        const highlight = this._highlight !== null && this._highlight !== undefined ? [this._highlight] : [];
        const chips = this.roomChips({ rooms, selected: highlight, order });
        if (this.chips) this.chips.remove();
        this.el.insertBefore(chips, this.notes);
        this.chips = chips;
        chips.hidden = !chips.childNodes.length;
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
            return;
        }
        for (const layer of this._layers.values()) this._renderLayer(layer, true);
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
    consumables: (card) => groupView(card, 'consumables')
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
 * Weekday order of DnD `wk` (bit mask 1–127) and schedule `repeats` ("0000000").
 * dreame_vacuum v2.0.3 decodes neither (device.py#L1717, #L1745, #L4263 pass
 * them through); `repeats` is left-padded (`zfill(7)`, device.py#L1745), so it
 * is read as a binary number, highest bit first.
 * shortcut: bit d = Date#getDay d (0 = Sunday) is an assumption until a weekday
 * example from the Dreame app confirms it; every conversion goes through
 * WEEKDAY_BIT, so a correction is one line. The mapping is a bijection: an
 * entry the user does not touch is written back unchanged either way.
 */
const WEEKDAY_BIT = (day) => 1 << day;
const daysOfMask = (mask) => [0, 1, 2, 3, 4, 5, 6].filter((day) => (Number(mask) & WEEKDAY_BIT(day)) !== 0);
const maskOfDays = (days) => days.reduce((mask, day) => mask | WEEKDAY_BIT(day), 0);
const maskOfRepeats = (text) => (/^[01]{1,7}$/.test(String(text)) ? parseInt(String(text), 2) : 0);
const repeatsOfMask = (mask) => Number(mask).toString(2).padStart(7, '0');

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

/** The integration's own wire form of a period (set_dnd_tasks, device.py#L4255ff); `ss` passes unchanged. */
const dndWire = (t) => ({ id: Number(t.id), en: t.enabled ? 1 : 0, st: t.start, et: t.end, wk: Number(t.repeats), ss: t.ss === undefined || t.ss === null ? 0 : Number(t.ss) });
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
        const days = document.createElement('span');
        days.className = 'setting-status';
        days.textContent = daysText(hass, t.repeats);
        text.append(name, days);
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
    body.appendChild(viewLink(translate(hass, 'zeitraumNeu'), 'dnd-add', 'mdi:plus', () => dialog.show(dndForm(card, null))));
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
    if (!draft.mask) errors.days = 'fehlerTage';
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
    const initial = () => (original ? { start: original.start, end: original.end, mask: Number(original.repeats), enabled: !!original.enabled }
        : { start: '22:00', end: '08:00', mask: 127, enabled: true });
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
            body.appendChild(fieldGroup('field-days', translate(hass, 'feld_days'), dayPicker(hass, draft, redraw), errors.days ? translate(hass, errors.days) : ''));
            const actions = document.createElement('div');
            actions.className = 'actions';
            if (original) {
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
                const entry = { id: original ? original.id : nextId, enabled: draft.enabled, start: draft.start, end: draft.end, repeats: draft.mask, ss: original ? original.ss : 0 };
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
            body.appendChild(noteLine(translate(hass, 'zeitraumLoeschenFrage', { zeitraum: periodText(hass, task), tage: daysText(hass, task.repeats) })));
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
        const status = dockStatus(model);
        add('station', translate(hass, 'station'), translate(hass, status.key || 'stationOk'));
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

/** What groups show above their rows. */
const GROUP_HEAD = {
    dnd: dndPeriods,
    consumables: consumableParts,
    info: deviceInfo
};

/** What groups show beyond their rows. */
const GROUP_EXTRAS = {
    // Water temperature, washing mode and frequency are dock's rows (ALL-03): one place, linked (R08).
    mopping: (card, model, body, hass, dialog) => {
        if (model.can('dock')) body.appendChild(viewLink(translate(hass, 'stationWaschen'), 'station', 'mdi:chevron-right', () => dialog.show(groupView(card, 'station'))));
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
.tasks {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ha-space-1, 4px);
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
.task-hint ha-icon {
    flex: none;
    --mdc-icon-size: 18px;
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
.obstacle-facts {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--ha-space-1, 4px) var(--ha-space-3, 12px);
    margin: 0;
}
.obstacle-facts dt {
    color: var(--secondary-text-color, #727272);
    overflow-wrap: anywhere;
}
.obstacle-facts dd {
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
    gap: var(--ha-space-1, 4px);
}
.day-picker .busch-ui-action {
    flex: 1 0 44px;
    padding-inline: var(--ha-space-1, 4px);
}
.field-label {
    overflow-wrap: anywhere;
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
                this._views.splice(-steps);
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
        if (this._depth > n) {
            this._popSteps = n;
            history.go(-n); // one popstate returns n views
            return;
        }
        this._views.splice(-n);
        this._render();
    }

    close() {
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
        this._seen = watchSnapshot(hass, [this._opts.entity, ...(mapCamera ? [mapCamera] : []), ...['sensor.battery_level', 'sensor.cleaned_area', 'sensor.cleaning_time', 'binary_sensor.charging_state', 'sensor.error', 'sensor.cleaning_progress'].map((k) => model.entity(k)).filter(Boolean)]);
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
        const percent = active && model.can('cleaning_progress') && !this._hidden('progress_bar') ? progressOf(hass, model) : null;
        this._progress.replaceChildren(...(percent === null ? [] : [this._progressBar(percent)]));
        this._renderMessages(hass, model);
        const needsMap = this._renderTasks(hass, model, active);

        const buttons = (this._hidden('action_buttons') ? [] : controlsFor(model, shown)).map((name) => {
            const label = translate(hass, name);
            // shortcut: map task types cannot start before map-view; Start waits with the hint shown.
            const blocked = name === 'start' && needsMap;
            const button = BuschUI.action({ label, text: label, icon: CONTROLS[name].icon, variant: CONTROLS[name].variant || 'secondary', disabled: blocked, onClick: () => this._call(name, real) });
            if (blocked) button.setAttribute('aria-describedby', 'task-hint');
            button.classList.add('ctl');
            button.setAttribute('data-action', name);
            return button;
        });
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

    /** Task type choice (CORE-06). Returns true when the chosen type still needs the map. */
    _renderTasks(hass, model, active) {
        if (this._hidden('task_type')) {
            this._taskArea.replaceChildren();
            return false;
        }
        const types = tasksFor(model);
        const nodes = [];
        const chosen = active ? runningTask(model) : this._task;
        if (types.length > 1) {
            const group = document.createElement('div');
            group.className = 'tasks';
            group.setAttribute('role', 'radiogroup');
            group.setAttribute('aria-label', translate(hass, 'aufgabenart'));
            const shownChoice = types.some((t) => t.name === chosen) ? chosen : 'all';
            types.forEach((type, index) => {
                const label = translate(hass, type.text);
                const button = BuschUI.action({ label, text: label, icon: type.icon, disabled: active, onClick: () => { this._task = type.name; this._haptic(); this._update(); } });
                button.classList.add('task');
                button.setAttribute('role', 'radio');
                button.setAttribute('data-task', type.name);
                button.setAttribute('aria-checked', String(type.name === shownChoice));
                button.tabIndex = type.name === shownChoice ? 0 : -1;
                button.addEventListener('keydown', (event) => {
                    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
                    if (!step || active) return;
                    event.preventDefault();
                    this._task = types[(index + step + types.length) % types.length].name;
                    this._update();
                    const next = this._taskArea.querySelector('[data-task="' + this._task + '"]');
                    if (next) next.focus();
                });
                group.appendChild(button);
            });
            nodes.push(group);
        }
        const type = TASK_TYPES.find((t) => t.name === this._task);
        const needsMap = !active && types.length > 1 && !!type && !!type.map && types.includes(type);
        if (needsMap) nodes.push(this._note('task-hint', 'mdi:map-search-outline', translate(hass, 'brauchtKarte', { task: translate(hass, type.text) })));
        if (active) {
            const [key, icon] = model.attr('scheduled_clean') ? ['aufgabeGeplant', 'mdi:calendar-clock']
                : model.attr('shortcut_task') ? ['aufgabeShortcut', 'mdi:star-four-points-outline']
                : ['aufgabeLaeuft', 'mdi:progress-clock'];
            nodes.push(this._note('task-badge', icon, translate(hass, key)));
        }
        this._taskArea.replaceChildren(...nodes);
        return needsMap;
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

    /** Station status: colour AND text (R17), so it never speaks through colour alone. */
    _dock(hass, model) {
        const status = dockStatus(model);
        const node = document.createElement('div');
        node.className = 'dock';
        node.setAttribute('role', 'status');
        node.setAttribute('data-dock', status.level);
        const symbol = BuschUI.ha.icon(status.level === 'ok' ? 'mdi:home-variant-outline' : 'mdi:home-alert-outline');
        symbol.setAttribute('aria-hidden', 'true');
        const text = document.createElement('span');
        text.textContent = translate(hass, 'station') + (status.key ? ' · ' + translate(hass, status.key) : '');
        node.append(symbol, text);
        return node;
    }

    _call(name, real) {
        const control = CONTROLS[name];
        this._haptic();
        this._endPending();
        const pending = { state: control.target, from: real ? real.state : null, timer: null };
        pending.timer = setTimeout(() => {
            if (this._pending === pending) { this._pending = null; this._update(); }
        }, OPTIMISTIC_HOLD_MS);
        this._pending = pending;
        Promise.resolve(this._hass.callService('vacuum', control.service, { entity_id: this._opts.entity })).catch(() => {
            if (this._pending === pending) { this._endPending(); this._update(); }
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
        const floors = JSON.stringify(this._maps(hass));
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
    settingState,
    settingRow,
    MODULE_VIEWS,
    daysOfMask,
    maskOfDays,
    maskOfRepeats,
    repeatsOfMask,
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
