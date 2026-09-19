import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('output/playwright',{recursive:true});
const browser=await puppeteer.launch({headless:true,enableExtensions:true,pipe:true});
let stage='load',page;
try{
 await browser.installExtension(process.cwd());page=await browser.newPage();await page.setViewport({width:1680,height:720});
 await page.goto('https://www.youtube.com/watch?v=aqz-KE-bpKQ',{waitUntil:'domcontentloaded',timeout:45000});
 await page.waitForFunction(()=>document.querySelector('video')?.videoWidth>0&&document.querySelector('[data-fillframe]'),{timeout:30000});
 stage='cookie choice';
 await new Promise(r=>setTimeout(r,1500));
 for(const frame of page.frames()) {
   const buttons=await frame.$$('button');
   for(const button of buttons) {
     const text=await button.evaluate(el=>el.textContent.trim());
     if(text==='Reject all') {await button.click();break;}
   }
 }
 await new Promise(r=>setTimeout(r,800));
 stage='play';
 await page.evaluate(async()=>{const v=document.querySelector('video');v.muted=true;await v.play();});
 stage='time advances';
 await page.waitForFunction(()=>document.querySelector('video').currentTime>1,{timeout:10000});
 await page.hover('#movie_player');
 await page.click('[data-fillframe-toolbar]');
 assert(await page.evaluate(()=>document.querySelector('[data-fillframe]').shadowRoot.querySelector('#panel').hidden));
 await page.waitForFunction(()=>document.querySelector('video').style.getPropertyPriority('width')==='important');
 stage='fullscreen';
 await page.$eval('#movie_player',el=>el.requestFullscreen());
 await page.waitForFunction(()=>!!document.fullscreenElement);
 await new Promise(r=>setTimeout(r,2000));
 stage='geometry';
 await page.waitForFunction(()=>{const v=document.querySelector('video'),p=document.querySelector('#movie_player');return Math.abs(v.getBoundingClientRect().width-p.clientWidth)<2});
 await page.waitForFunction(()=>!document.querySelector('video').paused);
 const geometry=await page.evaluate(()=>{const v=document.querySelector('video'),p=document.querySelector('#movie_player');return {source:[v.videoWidth,v.videoHeight],video:[v.getBoundingClientRect().width,v.getBoundingClientRect().height],player:[p.clientWidth,p.clientHeight],currentTime:v.currentTime,paused:v.paused}});
 assert(Math.abs(geometry.video[0]/geometry.video[1]-geometry.source[0]/geometry.source[1])<.002);
 assert(geometry.video[1]>geometry.player[1]);
 assert(Math.abs(geometry.video[0]-geometry.player[0])<2);
 assert(geometry.player[0]/geometry.player[1]>2.2);
 await page.hover('#movie_player');
 assert(await page.$eval('[data-fillframe-toolbar]',b=>b.nextElementSibling.classList.contains('ytp-fullscreen-button')));
 assert(await page.evaluate(()=>document.querySelector('[data-fillframe]').shadowRoot.querySelector('#panel').hidden));
 await page.screenshot({path:'output/playwright/youtube-toolbar-direct-fill.png'});
 await page.click('[data-fillframe-toolbar]');
 await page.waitForFunction(()=>document.querySelector('video').style.getPropertyPriority('width')!=='important');
 await page.evaluate(()=>document.exitFullscreen());
 const result={browser:await browser.version(),url:page.url(),geometry,checks:['live YouTube player found','native toolbar button next to fullscreen directly auto-fills without opening controls','second toolbar click restores original','fullscreen fill at 21:9 preserves ratio','original restores player styles','fullscreen exit'],limits:['single public video in isolated headless Chrome; no physical display or DRM-service validation']};
 await writeFile('output/playwright/youtube-results.json',JSON.stringify(result,null,2));console.log(result);
}catch(error){console.error(stage,error.message); if(page){console.log(await page.evaluate(()=>({text:document.body.innerText.slice(0,1200),video:[...document.querySelectorAll('video')].map(v=>({t:v.currentTime,paused:v.paused,ready:v.readyState,w:v.videoWidth,h:v.videoHeight})),fullscreen:document.fullscreenElement?.tagName})));await page.screenshot({path:'output/playwright/youtube-incomplete.png'});} await writeFile('output/playwright/youtube-results.json',JSON.stringify({status:'incomplete',error:error.message,limits:'Live fullscreen playback acceptance not established'},null,2));process.exitCode=1;}finally{await browser.close()}
