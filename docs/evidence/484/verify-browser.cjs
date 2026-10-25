const path = require('node:path');
const fs = require('node:fs');
const { build } = require(process.cwd() + '/node_modules/esbuild');
const { chromium } = require(path.join(process.env.E2E_ARMY_NODE_MODULES || path.join(require('node:os').homedir(), 'agents/hub-live/ops/verify/e2e-army/node_modules'), 'playwright-core'));
(async () => {
  const root = process.cwd();
  const result = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {NextIntlClientProvider} from 'next-intl';
        import {BillForm} from './apps/web/components/purchases/bill-form';
        import ai from './apps/web/messages/ar/ai.json';
        import purchases from './apps/web/messages/ar/purchases.json';
        window.mount = (locale) => createRoot(document.getElementById('root')).render(
          <NextIntlClientProvider locale={locale} timeZone="UTC" messages={{ai,purchases}}>
          <BillForm projects={[{id:'project-484',name:'مشروع اختبار طويل للتحقق من الاتجاه'}]}
          items={[{id:'item-484',name:'وصف عربي طويل لاختبار القائمة واتجاه النص والمحاذاة',sku:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCD',costPrice:'1'}]}
          scanDefaults={{date:'2026-10-25',dueDate:'2026-11-24'}} onSubmit={()=>{}} onCancel={()=>{}} /></NextIntlClientProvider>);`,
      resolveDir: root, loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', jsx: 'automatic',
    alias: {'@': path.join(root,'apps/web')},
    define: {'process.env.NODE_ENV':'"production"'},
    plugins: [{name:'vendor-fixture',setup(b) {
      b.onResolve({filter:/^@\/lib\/hooks\/use-vendors$/},()=>({path:'vendors',namespace:'fixture'}));
      b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const useVendors = () => ({data:{data:[{id:"vendor-484",displayName:"مورد اختبار"}]}});'}));
    }}],
  });
  const postcss = require(root+'/node_modules/postcss');
  const tailwind = require(root+'/node_modules/tailwindcss');
  const css = await postcss([tailwind({...require(root+'/apps/web/tailwind.config.js'),content:[root+'/apps/web/components/**/*.{ts,tsx}']})])
    .process(fs.readFileSync(root+'/apps/web/app/globals.css','utf8'),{from:root+'/apps/web/app/globals.css'});
  const browser = await chromium.launch({headless:true});
  try {
    for(const [locale,dir] of [['ar','rtl'],['en','ltr']]) {
      for(const width of [375,1280]) {
        const page = await browser.newPage({viewport:{width,height:1600},locale:locale==='ar'?'ar-EG':'en-US'});
        await page.setContent(`<html lang="${locale}" dir="${dir}"><head></head><body><div id="root"></div></body></html>`);
        await page.addStyleTag({content:css.css});
        await page.addScriptTag({content:result.outputFiles[0].text});
        await page.evaluate(locale=>window.mount(locale),locale);
        const triggers = page.getByRole('combobox');
        await triggers.first().waitFor();
        if(await triggers.count()!==4) throw Error('Expected 4 bill selects');
        for(const trigger of await triggers.all()) {
          if(await trigger.getAttribute('dir')!==dir) throw Error('Incorrect trigger direction');
          await trigger.click();
          const listbox = page.getByRole('listbox');
          await listbox.waitFor();
          if(await listbox.getAttribute('dir')!==dir) throw Error('Incorrect portal direction');
          await page.keyboard.press('Escape');
        }
        const item = triggers.nth(3);
        await item.click();
        await page.getByRole('listbox').waitFor();
        await page.screenshot({path:`${root}/docs/evidence/484/bill-${locale}-${width}.png`,fullPage:true,animations:"disabled"});
        await page.keyboard.press('Escape');
        const noOverflow = await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth);
        console.log(`${locale} ${width}: trigger/listbox direction PASS; no horizontal page overflow=${noOverflow}`);
        await page.close();
      }
    }
  } finally {await browser.close();}
})().catch(err=>{console.error(err);process.exitCode=1;});
