/// <reference path="../content/base.d.ts" />
/// <reference path="../background/bg.d.ts" />
interface SuggestionE extends Readonly<CompletersNS.BaseSuggestion> {
  favIcon?: string;
  relevancy: number | string;
}
interface SuggestionEx extends SuggestionE {
  https: boolean;
  parsed?: string;
  text: string;
}
interface Render {
  (this: void, list: ReadonlyArray<Readonly<SuggestionE>>): string;
}
interface Post<R extends void | 1> {
  postMessage<K extends keyof FgReq>(request: Req.fg<K>): R;
  postMessage<K extends keyof FgRes>(request: Req.fgWithRes<K>): R;
}
interface FgPort extends chrome.runtime.Port, Post<1> {
}
type Options = VomnibarNS.FgOptions;
type AllowedActions = "dismiss"|"focus"|"blurInput"|"backspace"|"blur"|"up"|"down"|"toggle"|"pageup"|"pagedown"|"enter" | "";

interface ConfigurableItems {
  ExtId?: string;
  VomnibarListLength?: number;
  VomnibarRefreshInterval?: number;
  VomnibarWheelInterval?: number;
}
interface Window extends ConfigurableItems {}

declare const enum HeightData {
  InputBar = 54, InputBarWithLine = InputBar + 1,
  Item = 44, LastItemDelta = 3,
  MarginV = 20,
  InputBarAndMargin = InputBar + MarginV,
  InputBarWithLineAndMargin = InputBarWithLine + MarginV,
  ShadowMarginV = 8,
  AllNotList = InputBarWithLineAndMargin + VomnibarNS.Consts.MarginTop + ShadowMarginV * 2,
  // 22 is better than 21, because 74 is a result that has been cut (`floor(71 + 7.72 /2)`)
  MarginH = 22, AllNotUrl = 74, MeanWidthOfChar = 7.72,
}

declare var VSettings: undefined | null | {
  destroy(silent: true, keepChrome: true): void;
};
if (typeof VSettings === "object" && VSettings && typeof VSettings.destroy === "function") {
  VSettings.destroy(true, true);
  window.dispatchEvent(new Event("unload"));
}

var Vomnibar = {
  activate (options: Options): void {
    Object.setPrototypeOf(options, null);
    this.mode.type = this.modeType = ((options.mode || "") + "") as CompletersNS.ValidTypes || "omni";
    this.forceNewTab = !!options.force;
    this.isHttps = null;
    let { url, keyword, search } = options, start: number | undefined;
    this.width(options.width * 0.8);
    this.mode.maxResults = Math.min(Math.max(3, Math.round((options.height - HeightData.AllNotList) / HeightData.Item)), this.maxResults);
    this.init && this.setFav(options.ptype);
    if (this.mode.favIcon) {
      let scale = devicePixelRatio;
      scale = scale < 1.5 ? 1 : scale < 3 ? 2 : scale < 4 ? 3 : 4;
      this.favPrefix = ' icon" style="background-image: url(&quot;chrome://favicon/size/16' + (scale > 1 ? "@" + scale + "x" : "") + "/";
    }
    if (url == null) {
      return this.reset(keyword ? keyword + " " : "");
    }
    if (search) {
      start = search.start;
      url = search.url;
      keyword || (keyword = search.keyword);
    } else if (search === null) {
      url = VUtils.decodeURL(url).replace(<RegExpG> /\s$/g, "%20");
      if (!keyword && (<RegExpI>/^https?:\/\//i).test(url)) {
        this.isHttps = (url.charCodeAt(4) | KnownKey.CASE_DELTA) === KnownKey.s;
        url = url.substring(this.isHttps ? 8 : 7, url.indexOf("/", 8) === url.length - 1 ? url.length - 1 : undefined);
      }
    } else {
      url = VUtils.decodeURL(url, decodeURIComponent).trim().replace(<RegExpG> /\s+/g, " ");
    }
    if (keyword) {
      start = (start || 0) + keyword.length + 1;
      return this.reset(keyword + " " + url, start, start + url.length);
    } else {
      return this.reset(url);
    }
  },

  isActive: false,
  inputText: "",
  lastQuery: "",
  lastNormalInput: "",
  modeType: "omni" as CompletersNS.ValidTypes,
  useInput: true,
  completions: null as never as SuggestionE[],
  isEditing: false,
  isInputComposing: false,
  isHttps: null as boolean | null,
  isSearchOnTop: false,
  actionType: ReuseType.Default,
  matchType: CompletersNS.MatchType.Default,
  focused: true,
  blurWanted: false,
  forceNewTab: false,
  sameOrigin: false,
  showFavIcon: 0 as 0 | 1 | 2,
  showRelevancy: false,
  lastScrolling: 0,
  height: 0,
  heightList: 0,
  input: null as never as HTMLInputElement,
  bodySt: null as never as CSSStyleDeclaration,
  barCls: null as never as DOMTokenList,
  isSelOriginal: true,
  lastKey: VKeyCodes.None,
  keyResult: HandlerResult.Nothing,
  list: null as never as HTMLDivElement,
  onUpdate: null as (() => void) | null,
  doEnter: null as ((this: void) => void) | null,
  refreshInterval: Math.max(256, (<number>window.VomnibarRefreshInterval | 0) || 500),
  wheelInterval: Math.max(33, (<number>window.VomnibarRefreshInterval | 0) || 100),
  renderItems: null as never as Render,
  selection: -1,
  timer: 0,
  wheelTimer: 0,
  browserVersion: BrowserVer.assumedVer,
  wheelOptions: { passive: false, capture: true as true },
  show (): void {
    const zoom = 1 / window.devicePixelRatio;
    this.bodySt.zoom = zoom > 1 ? zoom + "" : "";
    this.focused || setTimeout(function() { Vomnibar.input.focus(); }, 34);
    addEventListener("wheel", this.onWheel, this.wheelOptions);
    this.input.value = this.inputText;
    this.OnShown && setTimeout(this.OnShown, 100);
  },
  hide (data?: "hide"): void {
    this.isActive = this.isEditing = this.isInputComposing = this.blurWanted = false;
    removeEventListener("wheel", this.onWheel, this.wheelOptions);
    this.timer > 0 && clearTimeout(this.timer);
    window.onkeyup = null as never;
    const el = this.input;
    el.blur();
    data || VPort.postMessage({ handler: "nextFrame", type: Frames.NextType.current, key: this.lastKey });
    this.bodySt.display = "none";
    this.list.textContent = el.value = "";
    this.list.style.height = "";
    this.barCls.remove("withList");
    if (this.sameOrigin) { return this.onHidden(); }
    requestAnimationFrame(() => Vomnibar.onHidden());
  },
  onHidden (): void {
    VPort.postToOwner({ name: "hide" });
    this.timer = this.height = this.heightList = this.matchType = 0;
    this.lastKey = VKeyCodes.None;
    this.completions = this.onUpdate = this.isHttps = null as never;
    this.mode.query = this.lastQuery = this.inputText = this.lastNormalInput = "";
    this.modeType = this.mode.type = "omni";
    this.doEnter && setTimeout(this.doEnter, 0);
    this.doEnter = null;
    (<RegExpOne> /a?/).test("");
  },
  reset (input: string, start?: number, end?: number): void {
    this.inputText = input;
    this.useInput = false;
    this.mode.query = this.lastQuery = input && input.trim().replace(this._spacesRe, " ");
    // also clear @timer
    this.update(0, (start as number) <= (end as number) ? function(this: typeof Vomnibar): void {
      this.show();
      this.input.setSelectionRange(start as number, end as number);
    } : this.show);
    this.isActive ? (this.height = -1) : (this.isActive = true);
    if (this.init) { return this.init(); }
  },
  update (updateDelay: number, callback?: () => void): void {
    this.onUpdate = callback || null;
    if (updateDelay >= 0) {
      this.isInputComposing = false;
      if (this.timer > 0) {
        clearTimeout(this.timer);
      }
      if (updateDelay === 0) {
        return this.fetch();
      }
    } else if (this.timer > 0) {
      return;
    } else {
      updateDelay = this.refreshInterval;
    }
    this.timer = setTimeout(this.OnTimer, updateDelay);
  },
  refresh (): void {
    let oldSel = this.selection, origin = this.isSelOriginal;
    this.useInput = false;
    this.width();
    return this.update(17, function(this: typeof Vomnibar): void {
      const len = this.completions.length;
      if (!origin && oldSel >= 0 && len > 0) {
        oldSel = Math.min(oldSel, len - 1);
        this.selection = 0; this.isSelOriginal = false;
        this.updateSelection(oldSel);
      }
      this.focused || this.input.focus();
    });
  },
  updateInput (sel: number): void {
    const focused = this.focused, blurred = this.blurWanted;
    this.isSelOriginal = false;
    if (sel === -1) {
      this.isHttps = null; this.isEditing = false;
      this.input.value = this.inputText;
      if (!focused) { this.input.focus(); this.blurWanted = blurred; }
      return;
    }
    blurred && focused && this.input.blur();
    const line: SuggestionEx = this.completions[sel] as SuggestionEx;
    if (line.parsed) {
      return this._updateInput(line, line.parsed);
    }
    (line as Partial<SuggestionEx>).https == null && (line.https = line.url.startsWith("https://"));
    if (line.type !== "history" && line.type.indexOf("#") < 0) {
      if (line.parsed == null) {
        VUtils.ensureText(line);
        line.parsed = "";
      }
      this._updateInput(line, line.text);
      if (line.type === "math") {
        this.input.select();
      }
      return;
    }
    const ind = VUtils.ensureText(line);
    let str = line.text;
    if (ind && str.lastIndexOf("://", 5) < 0) {
      str = (ind === 7 ? "http://" : "https://") + str;
    }
    return VPort.sendMessage({
      handler: "parseSearchUrl",
      url: str
    }, function(search): void {
      line.parsed = search ? (Vomnibar.modeType !== "omni" ? ":o " : "") + search.keyword + " " + search.url : line.text;
      if (sel === Vomnibar.selection) {
        return Vomnibar._updateInput(line, line.parsed);
      }
    });
  },
  toggleInput (): void {
    if (this.selection < 0) { return; }
    if (this.isSelOriginal) {
      this.inputText = this.input.value;
      return this.updateInput(this.selection);
    }
    let line = this.completions[this.selection] as SuggestionEx, str = this.input.value.trim();
    str = str === line.url ? (line.parsed || line.text)
      : str === line.text ? line.url : line.text;
    return this._updateInput(line, str);
  },
  _updateInput (line: SuggestionEx, str: string): void {
    this.input.value = str;
    this.isHttps = line.https && str === line.text;
    this.isEditing = str !== line.parsed || line.parsed === line.text;
  },
  updateSelection (sel: number): void {
    if (this.timer) { return; }
    const _ref = this.list.children, old = this.selection;
    (this.isSelOriginal || old < 0) && (this.inputText = this.input.value);
    this.updateInput(sel);
    this.selection = sel;
    old >= 0 && _ref[old].classList.remove("s");
    sel >= 0 && _ref[sel].classList.add("s");
  },
  ctrlMap: {
    66: "pageup", 74: "down", 75: "up", 219: "dismiss", 221: "toggle"
    , 78: "down", 80: "up"
  } as Dict<AllowedActions>,
  normalMap: {
    9: "down", 27: "dismiss", 33: "pageup", 34: "pagedown", 38: "up", 40: "down"
    , 112: "backspace", 113: "blur"
  } as Dict<AllowedActions>,
  onKeydown (event: KeyboardEvent): any {
    if (!this.isActive) { return; }
    let action: AllowedActions = "", n = event.keyCode, focused = this.focused;
    this.lastKey = n;
    if (event.altKey || event.metaKey) {
      if (event.ctrlKey || event.shiftKey) {}
      else if (n === VKeyCodes.f2) {
        return this.onAction(focused ? "blurInput" : "focus");
      }
      else if (!focused) {}
      else if (n > VKeyCodes.A && n < VKeyCodes.G && n !== VKeyCodes.C || n === VKeyCodes.backspace) {
        return this.onBashAction(n - VKeyCodes.maxNotAlphabet);
      }
      if (event.altKey) { this.keyResult = HandlerResult.Nothing; return; }
    }
    if (n === VKeyCodes.enter) {
      window.onkeyup = this.OnEnterUp;
      return;
    }
    else if (event.ctrlKey || event.metaKey) {
      if (event.shiftKey) { action = n === VKeyCodes.F ? "pagedown" : n === VKeyCodes.B ? "pageup" : ""; }
      else if (n === VKeyCodes.up || n === VKeyCodes.down || n === VKeyCodes.end || n === VKeyCodes.home) {
        event.preventDefault();
        this.lastScrolling = Date.now();
        window.onkeyup = Vomnibar.HandleKeydown;
        return VPort.postToOwner({ name: "scroll", keyCode: n });
      }
      else { action = this.ctrlMap[n] || ""; }
    }
    else if (event.shiftKey) {
      action = n === VKeyCodes.up ? "pageup" : n === VKeyCodes.down ? "pagedown" : n === VKeyCodes.tab ? "up" : "";
    }
    else if (action = this.normalMap[n] || "") {}
    else if (n === VKeyCodes.ime || n > VKeyCodes.f1 && n < VKeyCodes.minNotFn) {
      this.keyResult = HandlerResult.Nothing;
      return;
    }
    else if (n === VKeyCodes.backspace) {
      if (focused) { this.keyResult = HandlerResult.Suppress; }
      return;
    }
    else if (n !== VKeyCodes.space) {}
    else if (!focused) { action = "focus"; }
    else if ((this.selection >= 0
        || this.completions.length <= 1) && this.input.value.endsWith("  ")) {
      action = "enter";
    }
    if (action) {
      return this.onAction(action);
    }

    if (!focused && n < VKeyCodes.minNotNum && n > VKeyCodes.maxNotNum) {
      n = (n - VKeyCodes.N0) || 10;
      return !event.shiftKey && n <= this.completions.length ? this.onEnter(event, n - 1) : undefined;
    }
    this.keyResult = focused && n !== VKeyCodes.menuKey ? HandlerResult.Suppress : HandlerResult.Nothing;
  },
  onAction (action: AllowedActions): void {
    let sel: number;
    switch(action) {
    case "dismiss":
      const selection = window.getSelection();
      if (selection.type === "Range" && this.focused) {
        const el = this.input;
        sel = el.selectionDirection !== "backward" &&
          el.selectionEnd < el.value.length ? el.selectionStart : el.selectionEnd;
        el.setSelectionRange(sel, sel);
      } else {
        return this.hide();
      }
      break;
    case "focus": this.input.focus(); break;
    case "blurInput": this.blurWanted = true; this.input.blur(); break;
    case "backspace": case "blur":
      !this.focused ? this.input.focus()
      : action === "blur" ? VPort.postMessage({ handler: "nextFrame", type: Frames.NextType.current, key: this.lastKey })
      : document.execCommand("delete");
      break;
    case "up": case "down":
      sel = this.completions.length + 1;
      sel = (sel + this.selection + (action === "up" ? 0 : 2)) % sel - 1;
      return this.updateSelection(sel);
    case "toggle": return this.toggleInput();
    case "pageup": case "pagedown": return this.goPage(action !== "pageup");
    case "enter": return this.onEnter(true);
    }
  },
  onBashAction (code: number): void | boolean {
    const sel = window.getSelection(), isExtend = code === 4 || code < 0;
    sel.modify(isExtend ? "extend" : "move", code < 4 ? "backward" : "forward", "word");
    if (isExtend && this.input.selectionStart < this.input.selectionEnd) {
      return document.execCommand("delete");
    }
  },
  _pageNumRe: <RegExpOne> /(?:^|\s)(\+\d{0,2})$/,
  goPage (dir: boolean | number): void {
    const len = this.completions.length, n = this.mode.maxResults;
    let str = len ? this.completions[0].type : "", sel = +dir || -1;
    if (this.isSearchOnTop) { return; }
    str = (this.isSelOriginal || this.selection < 0 ? this.input.value : this.inputText).trimRight();
    let arr = this._pageNumRe.exec(str), i = ((arr && arr[0]) as string | undefined | number as number) | 0;
    if (len >= n) { sel *= n; }
    else if (i > 0 && sel < 0) { sel *= i >= n ? n : 1; }
    else if (len < (len && this.completions[0].type.indexOf("#") < 0 ? n : 3)) { return; }

    sel += i;
    sel = sel < 0 ? 0 : sel > 90 ? 90 : sel;
    if (sel == i) { return; }
    if (arr) { str = str.substring(0, str.length - arr[0].length); }
    str = str.trimRight();
    i = Math.min(this.input.selectionEnd, str.length);
    if (sel > 0) { str += " +" + sel; }
    sel = this.input.selectionStart;
    const oldDi = this.input.selectionDirection;
    this.input.value = str;
    this.input.setSelectionRange(sel, i, oldDi);
    this.isInputComposing = false;
    return this.update(-1);
  },
  onEnter (event?: MouseEvent | KeyboardEvent | true, newSel?: number): void {
    let sel = newSel != null ? newSel : this.selection;
    this.actionType = event == null ? this.actionType
      : event === true ? this.forceNewTab ? ReuseType.newFg : ReuseType.current
      : event.ctrlKey || event.metaKey ? event.shiftKey ? ReuseType.newBg : ReuseType.newFg
      : event.shiftKey || !this.forceNewTab ? ReuseType.current : ReuseType.newFg;
    if (newSel != null) {}
    else if (sel === -1 && this.input.value.length === 0) { return; }
    else if (!this.timer) {}
    else if (this.isEditing) { sel = -1; }
    else if (this.timer > 0) {
      return this.update(0, this.onEnter);
    } else {
      this.onUpdate = this.onEnter;
      return;
    }
    interface UrlInfo { url: string; sessionId?: undefined }
    const item: SuggestionE | UrlInfo = sel >= 0 ? this.completions[sel] : { url: this.input.value.trim() },
    func = function(this: void): void {
      return item.sessionId != null ? Vomnibar.gotoSession(item as SuggestionE & { sessionId: string | number })
        : Vomnibar.navigateToUrl(item as UrlInfo);
    };
    if (this.actionType < ReuseType.newFg) { return func(); }
    this.doEnter = func;
    return this.hide();
  },
  OnEnterUp (this: void, event: KeyboardEvent): void {
    if (event.isTrusted != false && event instanceof KeyboardEvent && event.keyCode === VKeyCodes.enter) {
      Vomnibar.lastKey = VKeyCodes.None;
      window.onkeyup = null as never;
      return Vomnibar.onEnter(event);
    }
  },
  onClick (event: MouseEvent): void {
    let el: Node | null = event.target as Node;
    if (event.isTrusted == false || !(event instanceof MouseEvent) || el === this.input || window.getSelection().type === "Range") { return; }
    if (el === this.input.parentElement) { return this.onAction("focus"); }
    if (this.timer) { event.preventDefault(); return; }
    while (el && el.parentNode !== this.list) { el = el.parentNode; }
    if (!el) { return; }
    this.lastKey = VKeyCodes.None;
    return this.onEnter(event, [].indexOf.call(this.list.children, el));
  },
  OnMenu (this: void, event: Event): void {
    let el = event.target as Element | null;
    for (; el && !el.classList.contains("url"); el = el.parentElement) {}
    if (!el || (el as HTMLAnchorElement).href) { return; }
    const _i = [].indexOf.call(Vomnibar.list.children, (el.parentNode as HTMLElement).parentNode);
    (el as HTMLAnchorElement).href = Vomnibar.completions[_i].url;
  },
  OnSelect (this: HTMLInputElement): void {
    let el = this;
    if (el.selectionStart !== 0 || el.selectionDirection !== "backward") { return; }
    let left = el.value,
    end = el.selectionEnd - 1;
    if (left.charCodeAt(end) !== KnownKey.space || end === left.length - 1) { return; }
    left = left.substring(0, end).trimRight();
    if (left.indexOf(" ") === -1) {
      el.setSelectionRange(0, left.length, 'backward');
    }
  },
  OnFocus (this: void, event: Event): void {
    event.isTrusted != false && (Vomnibar.focused = event.type !== "blur") && (Vomnibar.blurWanted = false);
  },
  OnTimer (this: void): void { if (Vomnibar) { return Vomnibar.fetch(); } },
  onWheel (event: WheelEvent): void {
    if (event.ctrlKey || event.metaKey || event.isTrusted == false) { return; }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.deltaX || Date.now() - this.wheelTimer < this.wheelInterval || !Vomnibar.isActive) { return; }
    this.wheelTimer = Date.now();
    return this.goPage(event.deltaY > 0);
  },
  onInput (event: KeyboardEvent): void {
    const s0 = this.lastQuery, s1 = this.input.value, str = s1.trim();
    this.blurWanted = false;
    if (str === (this.selection === -1 || this.isSelOriginal ? s0 : this.completions[this.selection].text)) {
      return;
    }
    if (this.matchType === CompletersNS.MatchType.emptyResult && str.startsWith(s0)) { return; }
    if (!str) { this.isHttps = null; }
    let i = this.input.selectionStart, arr: RegExpExecArray | null;
    if (this.isSearchOnTop) {}
    else if (i > s1.length - 2) {
      if (s1.endsWith(" +") && !this.timer && str.substring(0, str.length - 2).trimRight() === s0) {
        return;
      }
    } else if ((arr = this._pageNumRe.exec(s0)) && str.endsWith(arr[0])) {
      const j = arr[0].length, s2 = s1.substring(0, s1.trimRight().length - j);
      if (s2.trim() !== s0.substring(0, s0.length - j).trimRight()) {
        this.input.value = s2.trimRight();
        this.input.setSelectionRange(i, i);
      }
    }
    const { isComposing } = event;
    if (isComposing != null) {
      if (isComposing && !this.isInputComposing) {
        this.lastNormalInput = this.input.value.trim();
      }
      this.isInputComposing = isComposing;
    }
    return this.update(-1);
  },
  omni (response: BgVomnibarReq["omni"]): void {
    if (!this.isActive) { return; }
    const list = response.list, oldHeight = this.height, v = this.browserVersion;
    let pixel = 0.5;
    if (v < BrowserVer.MinRoundedBorderWidth) {
      pixel = Math.max(1, window.devicePixelRatio);
      pixel = v < BrowserVer.MinEnsuredBorderWidth ? (pixel | 0) / pixel : 1 / pixel;
    }
    let height = list.length, notEmpty = height > 0;
    this.showFavIcon = response.favIcon;
    this.matchType = response.matchType;
    this.completions = list;
    this.selection = (response.autoSelect || this.modeType !== "omni") && notEmpty ?  0 : -1;
    this.isSelOriginal = true;
    this.isSearchOnTop = notEmpty && list[0].type === "search";
    if (notEmpty) {
      // avoid `number * (.Item + pixel)` so that output is more precise
      height = height * HeightData.Item + HeightData.LastItemDelta + (height - 1) * pixel;
    }
    this.heightList = height;
    height = notEmpty ? height + HeightData.InputBarWithLineAndMargin : HeightData.InputBarAndMargin;
    this.height = height = Math.ceil(height + pixel + pixel);
    list.forEach(this.parse, this);
    return this.populateUI(oldHeight);
  },
  populateUI (oldH: number): void {
    const { list, barCls: cl, height } = this, notEmpty = this.completions.length > 0, c = "withList",
    msg = { name: "style" as "style", height };
    if (height > oldH) { VPort.postToOwner(msg); }
    oldH || (this.bodySt.display = "");
    notEmpty ? this.barCls.add(c) : cl.remove(c);
    list.innerHTML = this.renderItems(this.completions);
    list.style.height = (this.heightList + "").substring(0, 7) + "px";
    if (notEmpty) {
      if (this.selection === 0) {
        const line = this.completions[0] as SuggestionEx;
        VUtils.ensureText(line);
        (list.firstElementChild as HTMLElement).classList.add("s");
      }
      (list.lastElementChild as HTMLElement).classList.add("b");
    }
    if (height >= oldH) {
      return this.postUpdate();
    } else {
      requestAnimationFrame(() => { VPort.postToOwner(msg); return Vomnibar.postUpdate(); });
    }
  },
  postUpdate (): void {
    let func: typeof Vomnibar.onUpdate;
    if (this.timer > 0) { return; }
    this.timer = 0;
    this.isEditing = false;
    if (func = this.onUpdate) {
      this.onUpdate = null;
      return func.call(this);
    }
  },
  OnShown: function (this: void): void {
    const a = Vomnibar, i = a.input;
    i.onselect = a.OnSelect;
    i.onfocus = i.onblur = a.OnFocus;
    addEventListener("focus", VPort.EnsurePort, true);
    a.OnShown = null;
  } as ((this: void) => void) | null,
  init (): void {
    window.onclick = function(e) { return Vomnibar.onClick(e); };
    this.onWheel = this.onWheel.bind(this);
    Object.setPrototypeOf(this.ctrlMap, null);
    Object.setPrototypeOf(this.normalMap, null);
    this.input = document.getElementById("input") as HTMLInputElement;
    const list = this.list = document.getElementById("list") as HTMLDivElement;
    this.input.oninput = this.onInput.bind(this);
    this.bodySt = (document.documentElement as HTMLHtmlElement).style;
    this.barCls = (this.input.parentElement as HTMLElement).classList;
    list.oncontextmenu = this.OnMenu;
    (document.getElementById("close") as HTMLElement).onclick = function(): void { return Vomnibar.hide(); };
    addEventListener("keydown", this.HandleKeydown, true);
    this.renderItems = VUtils.makeListRenderer((document.getElementById("template") as HTMLElement).innerHTML);
    if (this.browserVersion < BrowserVer.MinRoundedBorderWidth) {
      const css = document.createElement("style");
      css.textContent = `body, .item, #input { border-width: ${this.browserVersion < BrowserVer.MinEnsuredBorderWidth ? 1 : 0.01}px; }`;
      (document.head as HTMLHeadElement).appendChild(css);
    }
    if (this.browserVersion < BrowserVer.Min$KeyboardEvent$$isComposing) {
      let func = function (this: void, event: CompositionEvent): void {
        if (Vomnibar.isInputComposing = event.type === "compositionstart") {
          Vomnibar.lastNormalInput = Vomnibar.input.value.trim();
        }
      };
      this.input.addEventListener("compositionstart", func);
      this.input.addEventListener("compositionend", func);
    }
    this.init = VUtils.makeListRenderer = null as never;
  },
  setFav (type: VomnibarNS.PageType): void {
    let fav = (2 - type) as 0 | 1 | 2, f: () => chrome.runtime.Manifest, manifest: chrome.runtime.Manifest;
    if (type === VomnibarNS.PageType.ext && location.protocol.startsWith("chrome") && (f = chrome.runtime.getManifest) && (manifest = f())) {
      const arr = manifest.permissions || [];
      fav = arr.indexOf("<all_urls>") >= 0 || arr.indexOf("chrome://favicon/") >= 0 ? this.sameOrigin && window.parent === window.top ? 2 : 1 : 0;
    }
    this.mode.favIcon = fav;
  },
  HandleKeydown (this: void, event: KeyboardEvent): void {
    if (event.isTrusted == false || !(event instanceof KeyboardEvent)) { return; }
    Vomnibar.keyResult = HandlerResult.Prevent as HandlerResult;
    if (window.onkeyup) {
      let stop = !event.repeat, now: number = 0;
      if (!Vomnibar.lastScrolling) {
        stop = event.keyCode > VKeyCodes.ctrlKey || event.keyCode < VKeyCodes.shiftKey;
      } else if (stop || (now = Date.now()) - Vomnibar.lastScrolling > 40) {
        VPort.postToOwner({ name: stop ? "scrollEnd" : "scrollGoing" });
        Vomnibar.lastScrolling = now;
      }
      if (stop) { window.onkeyup = null as never; }
    } else {
      Vomnibar.onKeydown(event);
    }
    if (Vomnibar.keyResult === HandlerResult.Nothing) { return; }
    if (Vomnibar.keyResult === HandlerResult.Prevent) { event.preventDefault(); }
    event.stopImmediatePropagation();
  },
  returnFocus (this: void, request: BgVomnibarReq["returnFocus"]): void {
    setTimeout<VomnibarNS.FReq["focus"] & VomnibarNS.Msg<"focus">>(VPort.postToOwner as
        any, 0, { name: "focus", key: request.key });
  },
  width (w?: number): void {
    this.mode.maxChars = Math.round(((w || window.innerWidth - HeightData.MarginH) - HeightData.AllNotUrl) / HeightData.MeanWidthOfChar);
  },
  secret: null as never as (request: BgVomnibarReq["secret"]) => void,

  maxResults: (<number>window.VomnibarListLength | 0) || 10,
  mode: {
    handler: "omni" as "omni",
    type: "omni" as CompletersNS.ValidTypes,
    maxChars: 0,
    maxResults: 0,
    favIcon: 1 as 0 | 1 | 2,
    query: ""
  },
  _spacesRe: <RegExpG> /\s+/g,
  _singleQuoteRe: <RegExpG> /'/g,
  fetch (): void {
    let mode = this.mode, str: string, s2: string, last: string, newMatchType = CompletersNS.MatchType.Default;
    this.timer = -1;
    if (this.useInput) {
      this.lastQuery = str = this.input.value.trim();
      if (!this.isInputComposing) {}
      else if (str.startsWith(last = this.lastNormalInput)) {
        str = last + str.substring(last.length).replace(this._singleQuoteRe, "");
      } else {
        str = str.replace(this._singleQuoteRe, " ");
      }
      str = str.replace(this._spacesRe, " ");
      if (str === mode.query) { return this.postUpdate(); }
      mode.type = this.matchType < CompletersNS.MatchType.singleMatch || !str.startsWith(mode.query) ? this.modeType
        : this.matchType === CompletersNS.MatchType.searchWanted ? "search"
        : (newMatchType = this.matchType,
          (s2 = this.completions[0].type).indexOf("#") < 0 ? s2 as CompletersNS.ValidTypes : "tab");
      mode.query = str;
      this.width();
      this.matchType = newMatchType;
    } else {
      this.useInput = true;
    }
    return VPort.postMessage(mode);
  },

  favPrefix: "",
  parse (item: SuggestionE): void {
    let str = this.showFavIcon ? item.url : "";
    item.favIcon = str
      ? this.favPrefix +
        ((str = this.parseFavIcon(item, str)) ? VUtils.escapeCSSStringInAttr(str) : "about:blank") + "&quot;)"
      : "";
    item.relevancy = this.showRelevancy ? `\n\t\t\t<span class="relevancy">${item.relevancy}</span>` : "";
  },
  parseFavIcon (item: SuggestionE, url: string): string {
    let str = url.substring(0, 11).toLowerCase();
    return str.startsWith("vimium://") ? "chrome-extension://" + (window.ExtId || chrome.runtime.id) + "/pages/options.html"
      : url.length > 512 || str === "javascript:" || str.startsWith("data:") ? ""
      : item.type === "search"
        ? url.startsWith("http") ? url.substring(0, (url.indexOf("/", url[4] === "s" ? 8 : 7) + 1) || url.length) : ""
      : url;
  },
  navigateToUrl (item: { url: string }): void {
    if (item.url.substring(0, 11).toLowerCase() === "javascript:") {
      VPort.postToOwner({ name: "evalJS", url: item.url });
      return;
    }
    return VPort.postMessage({
      handler: "openUrl",
      reuse: this.actionType,
      https: this.isHttps,
      url: item.url
    });
  },
  gotoSession (item: SuggestionE & { sessionId: string | number }): void {
    VPort.postMessage({
      handler: "gotoSession",
      active: this.actionType > ReuseType.newBg,
      sessionId: item.sessionId
    });
    if (this.actionType > ReuseType.newBg) { return; }
    window.getSelection().removeAllRanges();
    if (item.type.indexOf("#") < 0) {
      return this.refresh();
    }
    window.onfocus = function(e: Event): void {
      window.onfocus = null as never;
      if (e.isTrusted != false && VPort.port) { return Vomnibar.refresh(); }
    };
  }
},
VUtils = {
  makeListRenderer (this: void, template: string): Render {
    const a = template.split(/\{\{(\w+)}}/g);
    (<RegExpOne> /a?/).test("");
    return function(objectArray): string {
      let html = "", len = a.length;
      for (const o of objectArray) {
        for (let j = 0; j < len; j++) {
          html += (j & 1) ? o[a[j] as keyof SuggestionE] : a[j];
        }
      }
      return html;
    };
  },
  decodeURL (this: void, url: string, decode?: (this: void, url: string) => string): string {
    try {
      url = (decode || decodeURI)(url);
    } catch (e) {}
    return url;
  },
  ensureText (sug: SuggestionEx): ProtocolType {
    let url = sug.url, str = url.substring(0, 8).toLowerCase();
    const i = str.startsWith("http://") ? ProtocolType.http : str === "https://" ? ProtocolType.https : ProtocolType.others;
    if (!sug.text) {
      sug.text = i && i < url.length ? url.substring(i) : url;
    } else if (i && url.endsWith("/") && !url.endsWith("://") && !str.endsWith("/")) {
      str += "/";
    }
    return i;
  },
  escapeCSSStringInAttr (s: string): string {
    const escapeRe = <RegExpG & RegExpSearchable<0>> /["&'<>]/g;
    function escapeCallback(c: string): string {
      const i = c.charCodeAt(0);
      return i === KnownKey.and ? "&amp;" : i === KnownKey.quote1 ? "&apos;"
        : i < KnownKey.quote1 ? "\\&quot;" : i === KnownKey.lt ? "&lt;" : "&gt;";
    }
    this.escapeCSSStringInAttr = function(s): string {
      return s.replace(escapeRe, escapeCallback);
    };
    return this.escapeCSSStringInAttr(s);
  }
},
VPort = {
  port: null as FgPort | null,
  postToOwner: null as never as VomnibarNS.IframePort["postMessage"],
  postMessage<K extends keyof FgReq> (request: FgReq[K] & Req.baseFg<K>): void {
    try {
      (this.port || this.connect(PortType.omnibarRe)).postMessage<K>(request);
    } catch (e) {
      VPort = null as never;
      this.postToOwner({ name: "broken", active: Vomnibar.isActive });
    }
  },
  _callbacks: Object.create(null) as { [msgId: number]: <K extends keyof FgRes>(this: void, res: FgRes[K]) => void },
  _id: 1,
  sendMessage<K extends keyof FgRes> (request: FgReq[K] & Req.baseFg<K> , callback: (this: void, res: FgRes[K]) => void): void {
    const id = ++this._id;
    this._callbacks[id] = callback;
    return (this as Post<void>).postMessage({ _msgId: id, request });
  },
  Listener<K extends keyof FgRes, T extends keyof BgVomnibarReq> (this: void
        , response: Req.res<K> | (BgVomnibarReq[T] & { name: T, _msgId?: undefined; })): void {
    let id: number | undefined;
    if (id = response._msgId) {
      const handler = VPort._callbacks[id];
      delete VPort._callbacks[id];
      return handler((response as Req.res<K>).response);
    }
    return Vomnibar[(response as Req.bg<T>).name](response as BgVomnibarReq[T]);
  },
  OnOwnerMessage<K extends keyof VomnibarNS.CReq> ({ data: data }: { data: VomnibarNS.CReq[K] }): void {
    let name = ((data as VomnibarNS.Msg<string>).name || data) as keyof VomnibarNS.CReq | "onAction";
    if (name === "focus" || name === "backspace") { name = "onAction"; }
    return (Vomnibar as any)[name](data);
  },
  ClearPort (this: void): void { VPort.port = null; },
  connect (type: PortType): FgPort {
    const data = { name: "vimium++." + type }, port = this.port = (window.ExtId ?
      chrome.runtime.connect(window.ExtId, data) : chrome.runtime.connect(data)) as FgPort;
    port.onDisconnect.addListener(this.ClearPort);
    port.onMessage.addListener(this.Listener as (message: object) => void);
    return port;
  },
  EnsurePort (this: void, e: Event): void { if (e.isTrusted != false && VPort) { return VPort.postMessage({ handler: "blank" }); } },
  OnUnload (e: Event): void {
    if (!VPort || e.isTrusted == false) { return; }
    Vomnibar.isActive = false;
    Vomnibar.timer > 0 && clearTimeout(Vomnibar.timer);
    VPort.postToOwner({ name: "unload" });
  }
};
"".startsWith || (String.prototype.startsWith = function(this: string, s: string): boolean {
  return this.length >= s.length && this.lastIndexOf(s, 0) === 0;
});
"".endsWith || (String.prototype.endsWith = function(this: string, s: string): boolean {
  const i = this.length - s.length;
  return i >= 0 && this.indexOf(s, i) === i;
});
(function(): void {
  if (!(+<string>(document.documentElement as HTMLElement).getAttribute("data-version") >=
        1.62)) {
    location.href = "about:blank";
    return;
  }
  let curEl: HTMLScriptElement;
  if (location.pathname === "/front/vomnibar.html" || location.protocol !== "chrome-extension:"
   || !(curEl = document.currentScript as typeof curEl)) {}
  else if (curEl.src.endsWith("/front/vomnibar.js") && curEl.src.startsWith("chrome-extension:")) {
    window.ExtId = new URL(curEl.src).hostname;
  } else {
    curEl.remove();
    window.onmessage = function(event): void {
      if (event.source !== window.parent) { return; }
      const data: VomnibarNS.MessageData = event.data, script = document.createElement("script"),
      src = script.src = (data[1] as VomnibarNS.FgOptions).script;
      window.ExtId = new URL(src).hostname;
      script.onload = function(): void {
        return window.onmessage(event);
      };
      (document.head || document.documentElement as HTMLElement).appendChild(script);
      script.remove();
    };
    return;
  }

  let _sec = 0 as number,
  unsafeMsg = [] as [number, VomnibarNS.IframePort, Options | null][],
  handler = function(this: void, secret: number, port: VomnibarNS.IframePort, options: Options | null): void {
    if (_sec < 1 || secret != _sec) {
      _sec || unsafeMsg.push([secret, port, options]);
      return;
    }
    _sec = -1;
    clearTimeout(timer);
    window.onmessage = null as never;
    Vomnibar.sameOrigin = !!port.sameOrigin;
    VPort.postToOwner = port.postMessage.bind(port);
    port.onmessage = VPort.OnOwnerMessage;
    window.onunload = VPort.OnUnload;
    if (options) {
      return Vomnibar.activate(options);
    } else {
      port.postMessage({ name: "uiComponentIsReady" });
    }
  },
  timer = setTimeout(function() { window.location.href = "about:blank"; }, 700);
  Vomnibar.secret = function(this: typeof Vomnibar, request): void {
    this.secret = function() {};
    Vomnibar.browserVersion = request.browserVersion;
    const { secret } = request, msgs = unsafeMsg;
    _sec = secret;
    unsafeMsg = null as never;
    for (let i of msgs) {
      if (i[0] == secret) {
        return handler(i[0], i[1], i[2]);
      }
    }
  };
  window.onmessage = function(event): void {
    if (event.source === window.parent) {
      const data: VomnibarNS.MessageData = event.data;
      return handler(data[0], event.ports[0], data[1]);
    }
  };
VPort.connect(PortType.omnibar);
})();
