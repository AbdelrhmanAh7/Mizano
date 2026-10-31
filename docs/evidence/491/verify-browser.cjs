// Isolated real-component check with next-intl; no app routes, API, or application CSS. Run from repo root.
const fs = require('fs');
const path = require('path');
const http = require('http');
const root = process.cwd();
const esbuild = require(path.join(root, 'node_modules/esbuild'));
const { chromium } = require(process.env.MIZANO_PLAYWRIGHT_MODULE || path.join(process.env.HOME, 'agents/hub-live/ops/verify/e2e-army/node_modules/playwright-core'));
const out = '/tmp/mizano-491-browser';
fs.mkdirSync(out, {recursive: true});
(async () => {
  await esbuild.build({stdin: {contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {NextIntlClientProvider} from 'next-intl';
    import {CustomerForm} from './apps/web/components/sales/customer-form';
    import en from './apps/web/messages/en/sales.json';
    import ar from './apps/web/messages/ar/sales.json';
    const p = new URLSearchParams(location.search), locale=p.get('locale') || 'en';
    document.documentElement.lang=locale;
    document.documentElement.dir=locale==='ar'?'rtl':'ltr';
    createRoot(document.getElementById('root')).render(
      <NextIntlClientProvider locale={locale} messages={{sales:locale==='ar'?ar:en}} timeZone="UTC">
        <CustomerForm customer={p.get('mode')==='edit'?{name:'Customer 491'}:undefined}
          isSubmitting={p.get('pending')==='1'} onSubmit={()=>{document.getElementById('submitted').textContent='submitted'}} onCancel={()=>{}} />
      </NextIntlClientProvider>);
  `,resolveDir:root,loader:'tsx'}, bundle:true, outfile:out+'/bundle.js', platform:'browser', jsx:'automatic', tsconfig:path.join(root,'apps/web/tsconfig.json'), define:{'process.env.NODE_ENV':'"development"'}});
  const server = http.createServer((req,res) => {
    res.setHeader('Content-Type', req.url.startsWith('/bundle.js')?'text/javascript':'text/html');
    res.end(req.url.startsWith('/bundle.js')?fs.readFileSync(out+'/bundle.js'):'<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><output id="submitted"></output><script src="/bundle.js"></script></body></html>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser = await chromium.launch({headless:true});
    const page=await browser.newPage({viewport:{width:1000,height:850}});
    for(const [locale,dir,create,update,saving] of [['en','ltr','Create Customer','Update Customer','Saving...'],['ar','rtl','إنشاء عميل','تحديث العميل','جارٍ الحفظ...']]) {
      for(const mode of ['create','edit']) {
        await page.goto(`http://127.0.0.1:${server.address().port}/?locale=${locale}&mode=${mode}`);
        const button=page.getByRole('button',{name:mode==='create'?create:update,exact:true});
        await button.waitFor();
        if(await page.locator('html').getAttribute('dir')!==dir) throw Error('Incorrect direction');
        await button.scrollIntoViewIfNeeded();
        await page.screenshot({path:path.join(out,`${locale}-${mode}.png`)});
        if(mode==='create') {
          await button.click();
          await page.getByText('Customer name is required',{exact:true}).waitFor();
          if(await page.locator('#submitted').textContent()) throw Error('Invalid form submitted');
        }
        console.log(`${locale} ${dir} ${mode}: accessible/visible action and screenshot OK`);
      }
      await page.goto(`http://127.0.0.1:${server.address().port}/?locale=${locale}&pending=1`);
      const pending=page.getByRole('button',{name:saving,exact:true});
      await pending.waitFor();
      if(!await pending.isDisabled()) throw Error('Pending button enabled');
      console.log(`${locale}: disabled localized saving OK`);
    }
  } finally { if(browser) await browser.close(); server.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
