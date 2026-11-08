'use client';

import { useEffect, useState } from 'react';
import { Lang, translate } from './i18n';

const STORAGE_KEY = 'ai_tax_lang';
const ATTRS = ['placeholder', 'title', 'aria-label'] as const;

/**
 * EN | RU switch. In RU mode it translates rendered text in place (text nodes and a few
 * attributes) and keeps translating whatever React renders next. Switching back restores
 * the original English. Elements with data-no-translate are left alone.
 */
export default function LanguageSwitch() {
  const [lang, setLang] = useState<Lang>('en');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'ru' || saved === 'en') setLang(saved);
      else if (navigator.language?.toLowerCase().startsWith('ru')) setLang('ru');
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* ignore */
    }
    if (lang === 'en') return;

    const original = new WeakMap<Node, string>();
    const shown = new WeakMap<Node, string>();
    const attrOriginal = new WeakMap<Element, Map<string, string>>();

    const skip = (el: Element | null) =>
      !!el?.closest('script,style,textarea,[data-no-translate]');

    const doText = (node: Text) => {
      if (skip(node.parentElement)) return;
      const current = node.nodeValue ?? '';
      if (shown.get(node) === current) return; // our own write
      const out = translate(current, 'ru');
      original.set(node, current);
      shown.set(node, out);
      if (out !== current) node.nodeValue = out;
    };

    const doAttrs = (el: Element) => {
      if (skip(el)) return;
      for (const a of ATTRS) {
        const v = el.getAttribute(a);
        if (!v) continue;
        const store = attrOriginal.get(el) ?? new Map<string, string>();
        if (store.get(`${a}:shown`) === v) continue;
        const out = translate(v, 'ru');
        store.set(a, v);
        store.set(`${a}:shown`, out);
        attrOriginal.set(el, store);
        if (out !== v) el.setAttribute(a, out);
      }
    };

    const walk = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) return doText(root as Text);
      if (root.nodeType !== Node.ELEMENT_NODE) return;
      doAttrs(root as Element);
      const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      let n: Node | null = tw.nextNode();
      while (n) {
        if (n.nodeType === Node.TEXT_NODE) doText(n as Text);
        else doAttrs(n as Element);
        n = tw.nextNode();
      }
    };

    walk(document.body);
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'characterData') doText(r.target as Text);
        else if (r.type === 'attributes') doAttrs(r.target as Element);
        else r.addedNodes.forEach(walk);
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...ATTRS],
    });

    return () => {
      observer.disconnect();
      // Restore English where the node still shows our translation.
      const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      let n: Node | null = tw.nextNode();
      while (n) {
        if (n.nodeType === Node.TEXT_NODE) {
          const o = original.get(n);
          if (o !== undefined && shown.get(n) === n.nodeValue) n.nodeValue = o;
        } else {
          const store = attrOriginal.get(n as Element);
          if (store) {
            for (const a of ATTRS) {
              const o = store.get(a);
              if (o !== undefined && (n as Element).getAttribute(a) === store.get(`${a}:shown`)) {
                (n as Element).setAttribute(a, o);
              }
            }
          }
        }
        n = tw.nextNode();
      }
    };
  }, [lang]);

  return (
    <div
      data-no-translate
      className="fixed bottom-4 right-4 z-50 flex rounded-full border border-slate-300 bg-white/95 p-1 text-xs font-semibold shadow-md backdrop-blur"
      role="group"
      aria-label="Language"
    >
      {(['en', 'ru'] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`rounded-full px-3 py-1.5 ${lang === l ? 'bg-sky-700 text-white' : 'text-slate-600 hover:text-slate-900'}`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
