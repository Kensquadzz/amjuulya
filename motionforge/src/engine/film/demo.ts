// A neutral demo storyboard (no customer content): exercises every film scene
// kind and transition; used by the tests and as the scene's starting example.
import { DEFAULT_PALETTE, type Storyboard } from './plan';

export const DEMO_STORYBOARD: Storyboard = {
  brand: 'NOVA DOCS KIT',
  duration: 36,
  palette: DEFAULT_PALETTE,
  fonts: { display: 'Montserrat', ui: 'Inter' },
  facts: ['NOVA DOCS KIT', 'NOVA DOCS', 'KIT', 'Contracts', 'Orders', 'Forms', 'Letters', 'Leave request', 'Onboarding sheet', 'Exit interview', 'Word', 'Excel', '50+', '$40', '$20', '1'],
  scenes: [
    { id: 'q1', kind: 'question', start: 0, end: 2.4, say: 'Do you work in an office?', copy: { lines: 'Do you work\nin an office?', highlight: 'office' }, beats: [0.5, 1.0] },
    { id: 'q2', kind: 'question', start: 2.4, end: 4.8, say: 'or run your own business?', copy: { kicker: 'or', lines: 'run your own\nbusiness?', highlight: 'business' }, beats: [2.8, 3.4], enter: 'pushUp' },
    { id: 'pack', kind: 'brand', start: 4.8, end: 7.0, say: 'This kit is made for you.', copy: { lead: 'made for you', name: 'NOVA DOCS', sub: 'KIT' }, beats: [4.85, 5.3] },
    { id: 'daily', kind: 'folders', start: 7.0, end: 9.6, say: 'Your everyday work,', copy: { lead: 'everyday work', title: 'NOVA DOCS KIT', items: 'Contracts\nOrders\nForms\nLetters' }, enter: 'zoomIn' },
    { id: 'kinds', kind: 'roll', start: 9.6, end: 13.0, say: 'contracts, orders, forms, letters,', copy: { kicker: 'everyday work', items: 'Contracts\nOrders\nForms\nLetters' }, beats: [10.2, 10.9, 11.6, 12.3], enter: 'pushUp' },
    { id: 'forms', kind: 'list', start: 13.0, end: 16.2, say: 'forms you need every day.', copy: { title: 'Forms', items: 'Leave request | Word\nOnboarding sheet | Excel\nExit interview | Word', caption: 'you need every day', highlight: 'every day' }, beats: [14.6], enter: 'pushUp' },
    { id: 'blank', kind: 'blank', start: 16.2, end: 18.6, say: 'Instead of writing from scratch', copy: { lines: 'Instead of writing\nfrom scratch' }, beats: [17.9], enter: 'swipe' },
    { id: 'ready', kind: 'template', start: 18.6, end: 22.4, say: 'take a ready template, add your details and use it.', copy: { lead1: 'take a ready template', lead2: 'add your details', lead3: 'and use it' }, beats: [19.4, 19.8, 21.2], enter: 'swipe' },
    { id: 'count', kind: 'counter', start: 22.4, end: 26.6, say: 'Over fifty documents in one place', copy: { number: '50+', lead: 'documents', tail: 'in one place' }, beats: [23.4, 24.8], enter: 'zoomIn' },
    { id: 'edit', kind: 'apps', start: 26.6, end: 29.6, say: 'Edit them right in Word and Excel.', copy: { a: 'Word', b: 'Excel', lead: 'Edit them right in' }, beats: [26.65, 27.2, 28.0], enter: 'zoomIn' },
    { id: 'now', kind: 'reveal', start: 29.6, end: 31.4, say: 'And now', copy: { kicker: 'And now' }, beats: [30.4], enter: 'iris' },
    { id: 'price', kind: 'price', start: 31.4, end: 33.6, say: '$20 instead of $40', copy: { old: '$40', now: '$20' }, beats: [32.3, 32.5] },
    { id: 'cta', kind: 'cta', start: 33.6, end: 36, say: 'For details, comment 1.', copy: { lead: 'For details,', main: 'comment 1', typed: '1', brand: 'NOVA DOCS KIT' }, beats: [34.4, 35.0], enter: 'iris' },
  ],
};
