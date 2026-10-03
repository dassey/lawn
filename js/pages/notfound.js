import { mountChrome, setTitle } from '../core/ui.js';
import { html, render, $ } from '../core/dom.js';
import { icon } from '../core/icons.js';

mountChrome('');
setTitle('Page not found');
render($('#app'), html`<section class="page-head">
  <span class="eyebrow">404</span>
  <h1>That page isn't in the almanac</h1>
  <p class="lede">The link may be old. Try the month-by-month calendar, or search for what you need.</p>
  <p class="row" style="margin-top:16px"><a class="btn btn-primary" href="index.html">${icon('home')}Today</a><a class="btn" href="calendar.html">${icon('calendar')}Calendar</a><button class="btn" type="button" data-action="search">${icon('search')}Search</button></p>
</section>`);
