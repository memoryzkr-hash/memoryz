/**
 * Changes the dashboard makes to promo/config.yml, as text in → text out.
 * The YAML document API keeps the person's comments and layout around the edited keys.
 */
import { isScalar, parseDocument } from 'yaml';
import type { PlatformId, Slot } from './types';

type Doc = ReturnType<typeof parseDocument>;

function edit(text: string, change: (doc: Doc) => void): string {
  const doc = parseDocument(text);
  change(doc);
  // No line width: the one-line platform entries stay on one line.
  return doc.toString({ lineWidth: 0, flowCollectionPadding: false });
}

/** Turns scheduled posting on or off for one platform and sets its cycle. A blog automates one kind at a time. */
export function setAutomation(text: string, p: PlatformId, on: boolean, slot: Slot): string {
  return edit(text, (doc) => {
    doc.setIn(['platforms', p, 'enabled'], on);
    const node = doc.createNode(slot, { flow: true });
    const time = node.get('time', true);
    if (isScalar(time)) time.type = 'QUOTE_DOUBLE'; // "09:00", as written by hand (YAML 1.1 readers see 9:00 as a number)
    doc.setIn(['platforms', p, 'schedule'], node);
    if (p === 'wordpress' || p === 'naver') doc.setIn(['platforms', p === 'wordpress' ? 'naver' : 'wordpress', 'enabled'], false);
  });
}

/** Naver or Tistory: the paste-ready export. WordPress is chosen by registering its address. */
export function setBlogKind(text: string, kind: 'naver' | 'tistory' | 'wordpress'): string {
  if (kind === 'wordpress') return text;
  return edit(text, (doc) => {
    doc.setIn(['platforms', 'naver', 'kind'], kind);
    doc.setIn(['platforms', 'wordpress', 'url'], '');
    if (doc.getIn(['platforms', 'wordpress', 'enabled'])) {
      doc.setIn(['platforms', 'wordpress', 'enabled'], false);
      doc.setIn(['platforms', 'naver', 'enabled'], true);
    }
  });
}

export function setBrand(text: string, b: { name: string; handle: string; review: boolean }): string {
  return edit(text, (doc) => {
    doc.setIn(['brand', 'name'], b.name);
    doc.setIn(['brand', 'handle'], b.handle);
    doc.setIn(['mode'], b.review ? 'review' : 'auto');
  });
}

export function setWordPressUrl(text: string, url: string): string {
  return edit(text, (doc) => doc.setIn(['platforms', 'wordpress', 'url'], url.replace(/\/+$/, '')));
}

export function setMediaRepo(text: string, repo: string): string {
  return edit(text, (doc) => doc.setIn(['media', 'repo'], repo));
}
