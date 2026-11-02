// Run with Netlify dev listening on port 8889. External requests and API writes are intercepted.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import chromium from '@sparticuz/chromium';
const browser=await puppeteer.launch({executablePath:await chromium.executablePath(),args:chromium.args,headless:true});
try {
 const page=await browser.newPage();
 await page.setRequestInterception(true);
 page.on('request',r=>{
  const u=new URL(r.url());
  if(u.host!=='localhost:8889') return r.respond({status:200,contentType:r.resourceType()==='script'?'text/javascript':'text/plain',body:''});
  if(r.method()!=='GET'||u.pathname.startsWith('/api/')||u.pathname.startsWith('/.netlify/functions/')) return r.respond({status:200,contentType:'application/json',body:'{"success":false,"data":[],"ports":[]}'});
  return r.continue();
 });
 await page.goto('http://localhost:8889/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.DossierManager&&window.resetTotalEstimation);
 const result=await page.evaluate(async()=>{
  const fields={'port-pol':'Rotterdam','port-pod':'Houston','cargo-qty':'10000','cargo-type-manual':'100','vessel-dwt':'15000','dist-laden':'3000','dist-ballast':'500','spd-ballast':'11','spd-laden':'11','cons-sea':'10','cons-port':'2','price-sea':'600','price-port':'800','opex-daily':'5000','rate-load':'1000','rate-disch':'1500','margin-owner':'15','margin-charterer':'10','pda-pol':'20000','pda-pod':'25000','eu-carbon-price':'80','comm-pct':'2.5','inverse-tce-target':'12000','ets-route-type':'0.5'};
  const payload={calculatorState:{activeReference:'OLD',cargo:10000,dwt:15000,pol:'Rotterdam',pod:'Houston',distLaden:3000,distBallast:500,spdBallast:11,spdLaden:11,consSea:10,consPort:2,priceSea:600,pricePort:800,opex:5000,loadRate:1000,dischRate:1500,marginOwner:15,marginCharterer:10,pdaPol:20000,pdaPod:25000,euCarbonPrice:80,etsRouteFactor:.5,commPct:2.5,freightSell:33.77},fields};
  const open=()=>window.applyAuditSessionPayload(payload,{reference:'RDM/2026-REOPEN'});
  const numeric=()=>Object.fromEntries(Object.entries(window.State).filter(([key,val])=>typeof val==='number'&&Number.isFinite(val)));
  await open(); const first=numeric();
  window.State.marketBenchmark={rate:99};window.State.emissionsCO2=99999;window.State.orphanCost=234;
  document.getElementById('freight-sell').dataset.marginSynced='true';
  await open(); const second=numeric();
  const differences=Object.keys(second).filter(k=>first[k]!==second[k]).map(k=>({key:k,first:first[k],second:second[k]}));
  const refs=[window.DossierManager.requestNewEstimation(),window.DossierManager.requestNewEstimation()];
  return {positiveCost:first.costTotal>0,firstCost:first.costTotal,secondCost:second.costTotal,differences,distinctReferences:refs[0]!==refs[1],orphanRemoved:window.State.orphanCost===undefined};
 });
 assert.equal(result.positiveCost, true);
 assert.deepEqual(result.differences, []);
 assert.equal(result.distinctReferences, true);
 assert.equal(result.orphanRemoved, true);
 console.log('Browser check passed: repeatable positive costs, fresh references and no residual state.');
}finally{await browser.close();}
