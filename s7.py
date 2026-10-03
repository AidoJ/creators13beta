import asyncio,json,os
from playwright.async_api import async_playwright
m=json.load(open(os.path.expanduser("~/.cache/lovable-auth/session.json")))
U="https://creators13beta.lovable.app"
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(headless=True); c=await b.new_context(viewport={"width":820,"height":1180}); pg=await c.new_page()
    await pg.goto(U); await pg.evaluate(f"localStorage.setItem({json.dumps(m['storage_key'])},{json.dumps(json.dumps(m['session']))})")
    await pg.goto(U+"/settings/community"); await pg.wait_for_timeout(8000)
    await pg.screenshot(path="s7_1.png")
    t=await pg.inner_text("body"); print(t[:2500].replace("\n"," / "))
    print("fileinputs",await pg.locator("input[type=file]").count())
    await b.close()
asyncio.run(main())
