/** 홍보 자동화 (promo.html): blog, Instagram and Threads automations, each with its account, cycle and "글 만들기". */
import './promo.css';
import { accountsView } from './accounts';
import { createApp } from './app';
import { homeView } from './home';
import { platformView } from './platform';
import { settingsView } from './settings';

const app = createApp(document.getElementById('app')!, { home: homeView, platform: platformView, settings: settingsView, accounts: accountsView });
void app.reload();
