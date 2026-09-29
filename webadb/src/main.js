import './admin-store.js';
import { runGate } from './gate.js';
import { renderAndroid } from './ui-android.js';
import { DISCLAIMER_TEXT } from './legal.js';

window.yidreamUI = { renderAndroid, legalText: DISCLAIMER_TEXT };
runGate();
