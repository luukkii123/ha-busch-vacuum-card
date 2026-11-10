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
            hidden_card_objects: 'Ausgeblendete Teile'
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
            hidden_card_objects: 'Gewählte Teile zeigt die Karte nicht; ohne „Bestätigung beim Kartenwechsel“ wechselt sie die Karte ohne Rückfrage. Vorgabe keine.'
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
            karte: 'Karte',
            karteAlt: 'Karte „{karte}“ des Saugroboters',
            karteLaedt: 'Karte lädt …',
            karteLeer: 'Noch keine gespeicherte Karte. Sobald der Roboter eine Karte erstellt hat, erscheint sie hier; bis dahin geht die Reinigung „Gesamt“.',
            kameraWeg: 'Die Kartenkamera ist nicht verfügbar, deshalb fehlt die Karte. Steuerung und Status gehen weiter. Prüfe die Integration dreame_vacuum oder warte, bis die Kamera wieder da ist.',
            bildFehler: 'Das Kartenbild ließ sich nicht laden. Steuerung und Status gehen weiter. Versuche es erneut.',
            erneutLaden: 'Erneut laden',
            temporaereKarte: 'Temporäre Karte: noch nicht gespeichert.',
            kartierungLaeuft: 'Kartierung läuft – die Karte wächst mit.',
            ohneKalibrierung: 'Die Karte hat noch keine Kalibrierung: Roboter, Station und Räume lassen sich nicht einzeichnen.'
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
            hidden_card_objects: 'Hidden parts'
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
            hidden_card_objects: 'The card does not show the chosen parts; without “Map change confirmation” it changes maps without asking. Default none.'
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
            karte: 'Map',
            karteAlt: 'Map “{karte}” of the robot vacuum',
            karteLaedt: 'Map loading …',
            karteLeer: 'No saved map yet. Once the robot has created a map it shows here; until then cleaning “All” works.',
            kameraWeg: 'The map camera is unavailable, so the map is missing. Controls and status keep working. Check the dreame_vacuum integration or wait until the camera is back.',
            bildFehler: 'The map image could not be loaded. Controls and status keep working. Try again.',
            erneutLaden: 'Load again',
            temporaereKarte: 'Temporary map: not saved yet.',
            kartierungLaeuft: 'Mapping in progress – the map grows along.',
            ohneKalibrierung: 'The map has no calibration yet: robot, station and rooms cannot be drawn.'
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
    ] }
];

/** What the editor shows for an unset option; equal values are never written. */
const EDITOR_DEFAULTS = {
    title: '', scripts: [], full_height: false, aspect_ratio: '', max_height_offset: 0, left_handed: false,
    locked: 'auto', touch_lock: TOUCH_LOCK_MS.standard, disable_haptic: false, hidden_card_objects: []
};

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
        disable_haptic: raw.disable_haptic === true
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
    return { language: BuschUI.language(hass, { legacy: true }), ids, objects: ids.map((id) => hass.states[id]) };
}

function snapshotUnchanged(snapshot, hass) {
    if (!snapshot || !hass || !hass.states) return false;
    if (BuschUI.language(hass, { legacy: true }) !== snapshot.language) return false;
    return snapshot.ids.every((id, i) => hass.states[id] === snapshot.objects[i]);
}

// ---------------------------------------------------------------------------
// Map view (map-view): the live map and the map contract for later modules
// ---------------------------------------------------------------------------

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Vacuum attributes the map shows (ALL-13 display); a change of any redraws the map's frame. */
const MAP_VACUUM_KEYS = ['maps', 'map_count', 'selected_map', 'has_saved_map', 'has_temporary_map', 'mapping'];

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
        this.stats = { images: 0, data: 0, renders: 0 }; // for tests and the performance check
        this._cam = null;
        this._key = null;
        this._imageUrl = null;
        this._image = null;
        this._imageState = 'loading';
        this._matrix = null; // robot mm → image px
        this._size = { width: 0, height: 0 };
        this._build();
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
        this.region.append(this.stage);
        this.el.append(this.region, this.notes);
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
        const key = JSON.stringify([BuschUI.language(hass, { legacy: true }), ...MAP_VACUUM_KEYS.map((k) => model.attr(k))]);
        if (cam === this._cam && key === this._key) return;
        this._cam = cam;
        this._key = key;
        this._cameraId = id;
        this.stats.renders++;
        const a = this._attrs();
        this._matrix = affineFrom(a.calibration_points);
        this.region.setAttribute('aria-label', translate(hass, 'karteAlt', { karte: this._mapName() }));
        if (this._showsMap()) this._loadImage(a.entity_picture);
        this._render();
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
            this.pan.insertBefore(img, this.svg);
            this._imageState = 'ready';
            this._render();
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
        }
        this.stage.hidden = !shows;
        this.stage.setAttribute('aria-busy', String(this._imageState === 'loading'));
        this.notes.replaceChildren(...notes.map(([kind, icon, key]) => this._note(kind, icon, translate(hass, key))));
        this._layout();
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
        if (kind === 'error') {
            const retry = BuschUI.action({ label: translate(this.hass, 'erneutLaden'), text: translate(this.hass, 'erneutLaden'), icon: 'mdi:refresh', variant: 'quiet', onClick: () => this._loadImage(this._imageUrl, true) });
            retry.setAttribute('data-action', 'map-retry');
            node.appendChild(retry);
        }
        return node;
    }

    /** Places the image in the stage: fitted now, zoom and pan follow with the gesture task. */
    _layout() {
        const { width, height } = this._size;
        if (!width || !height) return;
        this.stage.style.setProperty('--bvc-map-aspect', width + ' / ' + height);
        const rect = this.stage.getBoundingClientRect();
        this._view = viewMatrix({ width, height, stageWidth: rect.width, stageHeight: rect.height });
        const m = this._view;
        this.pan.style.width = width + 'px';
        this.pan.style.height = height + 'px';
        this.pan.style.transform = 'matrix(' + [m.a, m.b, m.c, m.d, m.e, m.f].join(',') + ')';
        this.svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
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
            mode: 'image'
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
.map-pan {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: 0 0;
    will-change: transform;
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
function localSchema(hass, schema = SCHEMA_BUSCH_VACUUM_CARD) {
    return schema.map((field) => {
        if (field.schema) return Object.assign({}, field, { schema: localSchema(hass, field.schema) });
        const select = field.selector && field.selector.select;
        if (!select) return field;
        const prefix = field.name === 'locked' ? 'lock_' : 'obj_';
        const options = select.options.map((value) => ({ value, label: translate(hass, prefix + value) }));
        return Object.assign({}, field, { selector: { select: Object.assign({}, select, { options }) } });
    });
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
        const relabel = language !== this._language;
        this._hass = hass;
        this._language = language;
        if (!this._form) this._render();
        else {
            this._form.hass = hass;
            // Option names are part of the schema; a new hass each state change must not rebuild it.
            if (relabel) this._form.schema = localSchema(hass);
        }
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
                // Only what differs from the defaults: the YAML stays as short as a hand-written one.
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
        this._form.schema = localSchema(this._hass);
        this._form.data = Object.assign(BuschUI.cloneConfig(EDITOR_DEFAULTS), BuschUI.cloneConfig(this._config));
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
