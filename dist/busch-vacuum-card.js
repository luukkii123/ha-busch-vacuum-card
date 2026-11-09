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
            keinFormular: 'Der Editor von Home Assistant ist noch nicht geladen.'
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
            keinFormular: 'The Home Assistant editor has not loaded yet.'
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
}
.error {
    display: flex;
    align-items: flex-start;
    gap: var(--ha-space-3, 12px);
    color: var(--error-color, #db4437);
    font-size: var(--ha-font-size-s, 14px);
    overflow-wrap: anywhere;
}
`;

class BuschVacuumCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._opts = null;
        this._hass = null;
        this._errorKey = null;
        this._errorVars = null;
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
        this._render();
    }

    set hass(hass) {
        this._hass = hass;
        this._render();
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

    _render() {
        const root = this.shadowRoot;
        root.innerHTML = '';
        const style = document.createElement('style');
        style.textContent = CARD_STYLES;
        root.appendChild(style);
        const card = document.createElement('ha-card');
        card.dataset.uiContract = 'Busch HA UI 0.1.0';
        if (this._errorKey) {
            const box = document.createElement('div');
            box.className = 'error';
            box.appendChild(BuschUI.ha.icon('mdi:alert-circle-outline'));
            const message = document.createElement('span');
            message.textContent = translate(this._hass, this._errorKey, this._errorVars);
            box.appendChild(message);
            card.appendChild(box);
        }
        root.appendChild(card);
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
    version: CARD_VERSION
};

if (!customElements.get(CARD_TAG)) customElements.define(CARD_TAG, BuschVacuumCard);
if (!customElements.get(EDITOR_TAG)) customElements.define(EDITOR_TAG, BuschVacuumCardEditor);

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
