# Cursed Court — Image Requests (Completed archive)

Requests that have been generated, delivered, wired into the game, and
visually verified. Kept here so `image-requests.md` only lists pending work.

## ✅ Game logo — `public/images/logo.png`
Delivered 2026-08-31. Wired into the title screen (`src/ui/screens/title.ts`),
replacing the CSS-lettering fallback once loaded; purple aura + bob animation
kept behind it. Looks great — exactly the chunky arcade style requested.

## ✅ Favicon — `public/favicon.png`
Delivered 2026-08-31. Linked from `index.html`. Reads clearly at tab size.

## ✅ Title-screen background — `public/images/title-bg.jpg`
Delivered 2026-08-31. Layered under the animated stripe overlay with a
readability gradient; PRESS START got a dark pill + softer pulse so it stays
legible over the bright court art.

## ✅ Court-select preview cards — `public/images/court-{shibuya,nevarro,night}.jpg`
Delivered 2026-08-31. Cover the CSS-art previews in the court-select cards
(`src/ui/screens/courtSelect.ts`), with the CSS art kept as fallback. All
three match their in-game themes nicely.

## ✅ Victory-screen burst — `public/images/victory-burst.png`
Delivered 2026-08-31. Slowly-rotating layer behind the winner card
(`src/ui/screens/victory.ts`); confetti + starburst read beautifully.

## ✅ New court preview cards — `public/images/court-{jujutsuhigh,dune,mandalore,foundry,circuit,random}.jpg`
Delivered 2026-09-01 (uploaded by hoai2k). All six wired into the
court-select cards automatically via the existing `<img>` slot convention;
the RANDOM card art sits under the animated golden "?" overlay. Verified
loading on the court-select screen.
