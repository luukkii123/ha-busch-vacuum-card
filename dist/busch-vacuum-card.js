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
            entity: 'Saugroboter'
        },
        helpers: {
            entity: 'Der Saugroboter, den die Karte zeigt; zugehörige Entitäten findet sie über das Gerät. Pflichtfeld ohne Vorgabe.'
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
            platzhalter: 'Diese Ansicht kommt mit einem späteren Ausbau der Karte (Modul „{modul}“).'
        }
    },
    en: {
        name: 'Busch vacuum',
        description: 'Status and control of a robot vacuum with everything the device can do, even without a map.',
        labels: {
            entity: 'Robot vacuum'
        },
        helpers: {
            entity: 'The robot vacuum this card shows; it finds the related entities through the device. Required, no default.'
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
            platzhalter: 'This view comes with a later update of the card (module “{modul}”).'
        }
    }
};

const SCHEMA_BUSCH_VACUUM_CARD = [
    { name: 'entity', required: true, selector: { entity: { domain: 'vacuum' } } }
];

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

function normalizeConfig(raw) {
    const entity = raw && typeof raw.entity === 'string' ? raw.entity.trim() : '';
    if (!entity) throw new ConfigError('fehlerKeineEntitaet');
    if (domainOf(entity) !== 'vacuum') throw new ConfigError('fehlerFalscheDomain', { entity });
    return { entity };
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

    /** Consumables left in percent by attribute (`main_brush_left` …), without the `_time_left` ones. */
    consumables() {
        const attributes = (this.state && this.state.attributes) || {};
        return Object.fromEntries(Object.entries(attributes)
            .filter(([name, value]) => /_left$/.test(name) && !/_time_left$|^drying_left$/.test(name) && Number.isFinite(Number(value)))
            .map(([name, value]) => [name, Number(value)]));
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
// Card
// ---------------------------------------------------------------------------

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
    return { language: BuschUI.language(hass, { legacy: true }), ids, objects: ids.map((id) => hass.states[id]) };
}

function snapshotUnchanged(snapshot, hass) {
    if (!snapshot || !hass || !hass.states) return false;
    if (BuschUI.language(hass, { legacy: true }) !== snapshot.language) return false;
    return snapshot.ids.every((id, i) => hass.states[id] === snapshot.objects[i]);
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

const CARD_STYLES = BuschUI.cardStyles + `
:host {
    display: block;
    container-type: inline-size;
}
ha-card {
    overflow: hidden;
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
    color: var(--error-color, #db4437);
    font-size: var(--ha-font-size-s, 14px);
    overflow-wrap: anywhere;
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
    color: var(--success-color, #43a047);
}
.metric[data-battery=paused] ha-icon {
    color: var(--warning-color, #ffa600);
}
.metric[data-battery=low] ha-icon,
.metric[data-battery=low] .metric-value {
    color: var(--error-color, #db4437);
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
.dock {
    display: inline-flex;
    align-items: center;
    gap: var(--ha-space-1, 4px);
    margin-inline-start: auto;
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
    border-color: var(--warning-color, #ffa600);
    color: var(--warning-color, #ffa600);
}
.dock[data-dock=error] {
    border-color: var(--error-color, #db4437);
    color: var(--error-color, #db4437);
}
.progress {
    display: block;
    height: 4px;
    margin: calc(-1 * var(--ha-space-4, 16px)) calc(-1 * var(--ha-space-4, 16px)) 0;
    width: calc(100% + 2 * var(--ha-space-4, 16px));
    border: 0;
    appearance: none;
    background: var(--divider-color, #e0e0e0);
    accent-color: var(--primary-color, #03a9f4);
}
.progress::-webkit-progress-bar {
    background: var(--divider-color, #e0e0e0);
}
.progress::-webkit-progress-value {
    background: var(--primary-color, #03a9f4);
}
.progress::-moz-progress-bar {
    background: var(--primary-color, #03a9f4);
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
    border-inline-start: 4px solid var(--info-color, #039be5);
    border-radius: var(--ha-card-border-radius, 12px);
    background: var(--secondary-background-color, #eeeeee);
    min-width: 0;
}
.message[data-kind=error] {
    border-color: var(--error-color, #db4437);
}
.message[data-kind=warning],
.message[data-kind=low_water] {
    border-color: var(--warning-color, #ffa600);
}
.message > ha-icon {
    flex: none;
}
.message[data-kind=error] > ha-icon {
    color: var(--error-color, #db4437);
}
.message[data-kind=warning] > ha-icon,
.message[data-kind=low_water] > ha-icon {
    color: var(--warning-color, #ffa600);
}
.message-text {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
}
.message-text strong {
    margin-inline-end: var(--ha-space-1, 4px);
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
    flex: 1 1 0;
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
    background: var(--primary-color, #03a9f4);
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
    background: var(--warning-color, #ffa600);
    color: var(--text-primary-color, #ffffff);
    font-size: var(--ha-font-size-s, 12px);
}
.placeholder {
    margin: 0;
    color: var(--secondary-text-color, #727272);
    overflow-wrap: anywhere;
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
                this._depth = Math.max(0, this._depth - 1);
                this._views.pop();
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
        return this._sheet.querySelectorAll('button, input, select, textarea, [tabindex]')
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
        this._build();
    }

    set hass(hass) {
        // Home Assistant hands every card a new hass on every state change in
        // the house. Only the vacuum and the few sensors shown redraw.
        const unchanged = snapshotUnchanged(this._seen, hass) && (!hass || hass.entities === this._relatedFrom);
        this._hass = hass;
        if (this._dialog) this._dialog.hass = hass;
        if (!unchanged) this._update();
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
            this._menuButton = BuschUI.action({ label: 'menu', icon: 'mdi:dots-vertical', variant: 'icon-only', onClick: () => this._openDialog(this._menuView()) });
            this._menuButton.classList.add('menu-button');
            this._menuButton.setAttribute('aria-haspopup', 'dialog');
            const top = document.createElement('div');
            top.className = 'top';
            top.append(head, this._menuButton);
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
            card.append(this._progress, top, this._messages, this._stats, this._taskArea, this._controls);
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
        this._seen = watchSnapshot(hass, [this._opts.entity, ...['sensor.battery_level', 'sensor.cleaned_area', 'sensor.cleaning_time', 'binary_sensor.charging_state', 'sensor.error', 'sensor.cleaning_progress'].map((k) => model.entity(k)).filter(Boolean)]);
        const shown = this._pending ? this._pending.state : real ? real.state : 'unavailable';

        this._title.textContent = real ? real.attributes.friendly_name || this._opts.entity : this._opts.entity;
        const menuLabel = translate(hass, 'menu');
        BuschUI.action({ node: this._menuButton, label: menuLabel, icon: 'mdi:dots-vertical', variant: 'icon-only', onClick: () => this._openDialog(this._menuView()) });
        this._menuButton.hidden = menuFor(model).length === 0;
        this._stateLine.textContent = real ? formatState(hass, real, shown) : shown;

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
        const percent = active && model.can('cleaning_progress') ? progressOf(hass, model) : null;
        this._progress.replaceChildren(...(percent === null ? [] : [this._progressBar(percent)]));
        this._renderMessages(hass, model);
        const needsMap = this._renderTasks(hass, model, active);

        const buttons = controlsFor(model, shown).map((name) => {
            const label = translate(hass, name);
            // shortcut: map task types cannot start before map-view; Start waits with the hint shown.
            const blocked = name === 'start' && needsMap;
            const button = BuschUI.action({ label, text: label, icon: CONTROLS[name].icon, variant: CONTROLS[name].variant || 'secondary', disabled: blocked, onClick: () => this._call(name, real) });
            if (blocked) button.setAttribute('aria-describedby', 'task-hint');
            button.classList.add('ctl');
            button.setAttribute('data-action', name);
            return button;
        });
        if (model.can('dock')) buttons.push(this._dock(hass, model));
        this._controls.replaceChildren(...buttons);
    }

    _openDialog(view) {
        if (this._dialog && this._dialog.isConnected) return;
        const dialog = document.createElement(DIALOG_TAG);
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
                for (const entry of menuFor(model)) {
                    const text = translate(hass, entry.text);
                    const low = entry.name === 'consumables' ? Object.values(model.consumables()).filter((v) => v < 30).length : 0;
                    const lowText = low ? translate(hass, 'zubehoerNiedrig', { n: low }) : '';
                    const item = BuschUI.action({ label: lowText ? text + ' · ' + lowText : text, text, icon: entry.icon, variant: 'quiet', onClick: () => {
                        if (entry.name === 'locate') {
                            hass.callService('vacuum', 'locate', { entity_id: this._opts.entity });
                            dialog.close();
                        } else dialog.show(this._placeholderView(entry));
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
                const button = BuschUI.action({ label, text: label, icon: type.icon, disabled: active, onClick: () => { this._task = type.name; this._update(); } });
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
        const list = messagesFor(hass, model);
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
        this._hass = hass;
        if (this._form) this._form.hass = hass;
        else this._render();
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
            form.computeLabel = (item) => (item.name ? fieldLabel(this._hass, item.name) : '');
            form.computeHelper = (item) => (item.name ? fieldHelper(this._hass, item.name) : '');
            form.addEventListener('value-changed', (event) => {
                event.stopPropagation();
                const next = BuschUI.updateConfig(this._config, event.detail.value || {});
                next.type = 'custom:' + CARD_TAG;
                this._publishConfig(next);
            });
            this.shadowRoot.appendChild(form);
            this._form = form;
        }
        this._form.hass = this._hass;
        this._form.schema = SCHEMA_BUSCH_VACUUM_CARD;
        this._form.data = BuschUI.cloneConfig(this._config);
    }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

BuschVacuumCard.__internals = {
    TEXTE: TEXTE_BUSCH_VACUUM_CARD,
    SCHEMA: SCHEMA_BUSCH_VACUUM_CARD,
    normalizeConfig,
    findRelated,
    VacuumModel,
    DIALOG_STYLES,
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
