import puppeteer from 'puppeteer'

const TIMEOUT = 30_000

/**
 * Запускает SEO-аудит страницы.
 * @param {string} url
 * @returns {Promise<AuditResult>}
 */
export async function auditUrl(url) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })

  try {
    const page = await browser.newPage()
    await page.setUserAgent('Mozilla/5.0 (compatible; SeoBotAuditor/1.0)')
    await page.setViewport({ width: 1280, height: 800 })

    const startTime = Date.now()
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT })
    const loadTime = Date.now() - startTime

    const statusCode = response?.status() ?? 0

    const data = await page.evaluate(() => {
      const getMeta = (name) =>
        document.querySelector(`meta[name="${name}"]`)?.content ||
        document.querySelector(`meta[property="${name}"]`)?.content || null

      const headings = {
        h1: Array.from(document.querySelectorAll('h1')).map(h => h.innerText.trim()),
        h2: Array.from(document.querySelectorAll('h2')).map(h => h.innerText.trim()).slice(0, 10),
        h3: Array.from(document.querySelectorAll('h3')).length,
      }

      const images = Array.from(document.querySelectorAll('img'))
      const imagesNoAlt = images.filter(img => !img.alt || img.alt.trim() === '').length

      const links = Array.from(document.querySelectorAll('a[href]'))
      const externalLinks = links.filter(a => {
        try { return new URL(a.href).hostname !== location.hostname } catch { return false }
      }).length

      const canonical = document.querySelector('link[rel="canonical"]')?.href || null
      const robotsMeta = getMeta('robots') || null

      return {
        title: document.title || null,
        titleLength: (document.title || '').length,
        description: getMeta('description'),
        descriptionLength: (getMeta('description') || '').length,
        ogTitle: getMeta('og:title'),
        ogDescription: getMeta('og:description'),
        ogImage: getMeta('og:image'),
        canonical,
        robotsMeta,
        headings,
        totalImages: images.length,
        imagesNoAlt,
        totalLinks: links.length,
        externalLinks,
        hasViewport: !!document.querySelector('meta[name="viewport"]'),
        bodyTextLength: (document.body?.innerText || '').replace(/\s+/g, ' ').trim().length,
        lang: document.documentElement.lang || null,
        schemaMarkup: !!document.querySelector('script[type="application/ld+json"]'),
      }
    })

    await browser.close()

    const checks = runChecks({ ...data, loadTime, statusCode, url })
    const score = calculateScore(checks)

    return { url, score, checks, raw: data, loadTime, statusCode }
  } catch (err) {
    await browser.close()
    throw err
  }
}

function runChecks({ title, titleLength, description, descriptionLength, headings,
  imagesNoAlt, totalImages, hasViewport, canonical, robotsMeta, loadTime,
  ogTitle, ogImage, lang, schemaMarkup, statusCode }) {

  return [
    {
      id: 'title',
      name: 'Title тег',
      status: !title ? 'fail' : titleLength < 10 ? 'warn' : titleLength > 70 ? 'warn' : 'pass',
      value: title,
      details: !title
        ? 'Title отсутствует — критичная ошибка'
        : titleLength < 10 ? `Слишком короткий: ${titleLength} символов (минимум 10)`
        : titleLength > 70 ? `Слишком длинный: ${titleLength} символов (рекомендуется до 70)`
        : `${titleLength} символов — отлично`,
    },
    {
      id: 'description',
      name: 'Meta description',
      status: !description ? 'fail' : descriptionLength < 50 ? 'warn' : descriptionLength > 160 ? 'warn' : 'pass',
      value: description,
      details: !description
        ? 'Meta description отсутствует'
        : descriptionLength < 50 ? `Слишком короткий: ${descriptionLength} символов`
        : descriptionLength > 160 ? `Слишком длинный: ${descriptionLength} символов (до 160)`
        : `${descriptionLength} символов — отлично`,
    },
    {
      id: 'h1',
      name: 'Заголовок H1',
      status: headings.h1.length === 0 ? 'fail' : headings.h1.length > 1 ? 'warn' : 'pass',
      value: headings.h1[0] ?? null,
      details: headings.h1.length === 0
        ? 'H1 отсутствует на странице'
        : headings.h1.length > 1 ? `Несколько H1: ${headings.h1.length} штук — должен быть один`
        : `H1 найден: "${headings.h1[0]?.slice(0, 60)}"`,
    },
    {
      id: 'h2',
      name: 'Заголовки H2',
      status: headings.h2.length === 0 ? 'warn' : 'pass',
      value: headings.h2.length,
      details: headings.h2.length === 0
        ? 'H2 заголовки отсутствуют — структура текста плохая'
        : `Найдено ${headings.h2.length} заголовков H2`,
    },
    {
      id: 'images_alt',
      name: 'Alt-теги изображений',
      status: totalImages === 0 ? 'pass' : imagesNoAlt === 0 ? 'pass' : imagesNoAlt / totalImages > 0.5 ? 'fail' : 'warn',
      value: `${imagesNoAlt}/${totalImages}`,
      details: totalImages === 0
        ? 'Изображений нет'
        : imagesNoAlt === 0 ? `Все ${totalImages} изображений имеют alt-текст`
        : `${imagesNoAlt} из ${totalImages} изображений без alt`,
    },
    {
      id: 'viewport',
      name: 'Мобильная версия',
      status: hasViewport ? 'pass' : 'fail',
      value: hasViewport,
      details: hasViewport
        ? 'Meta viewport присутствует — сайт адаптирован под мобильные'
        : 'Meta viewport отсутствует — сайт не адаптирован под мобильные',
    },
    {
      id: 'canonical',
      name: 'Canonical URL',
      status: canonical ? 'pass' : 'warn',
      value: canonical,
      details: canonical
        ? `Canonical установлен: ${canonical}`
        : 'Canonical ссылка отсутствует — возможны проблемы с дублями',
    },
    {
      id: 'og_tags',
      name: 'Open Graph теги',
      status: ogTitle && ogImage ? 'pass' : ogTitle || ogImage ? 'warn' : 'fail',
      value: ogTitle,
      details: ogTitle && ogImage
        ? 'OG title и OG image присутствуют'
        : !ogTitle && !ogImage ? 'OG теги отсутствуют — плохой вид в соцсетях'
        : `Частично: og:title ${ogTitle ? '✓' : '✗'}, og:image ${ogImage ? '✓' : '✗'}`,
    },
    {
      id: 'load_time',
      name: 'Скорость загрузки',
      status: loadTime < 2000 ? 'pass' : loadTime < 5000 ? 'warn' : 'fail',
      value: `${loadTime}ms`,
      details: loadTime < 2000 ? `Быстро: ${loadTime}мс`
        : loadTime < 5000 ? `Медленно: ${loadTime}мс (цель < 2000мс)`
        : `Очень медленно: ${loadTime}мс`,
    },
    {
      id: 'lang',
      name: 'Язык страницы',
      status: lang ? 'pass' : 'warn',
      value: lang,
      details: lang
        ? `Язык установлен: lang="${lang}"`
        : 'Атрибут lang не указан в тэге <html>',
    },
    {
      id: 'robots',
      name: 'Robots meta',
      status: robotsMeta && robotsMeta.includes('noindex') ? 'fail' : 'pass',
      value: robotsMeta,
      details: robotsMeta && robotsMeta.includes('noindex')
        ? `ВНИМАНИЕ: страница закрыта от индексации (${robotsMeta})`
        : robotsMeta ? `Robots: ${robotsMeta}` : 'Robots meta не задан (ОК — индексируется)',
    },
    {
      id: 'schema',
      name: 'Структурированные данные',
      status: schemaMarkup ? 'pass' : 'warn',
      value: schemaMarkup,
      details: schemaMarkup
        ? 'JSON-LD разметка присутствует'
        : 'Структурированные данные (Schema.org) отсутствуют',
    },
  ]
}

function calculateScore(checks) {
  const weights = {
    title: 15,
    description: 12,
    h1: 12,
    h2: 6,
    images_alt: 8,
    viewport: 10,
    canonical: 5,
    og_tags: 7,
    load_time: 10,
    lang: 5,
    robots: 5,
    schema: 5,
  }
  const total = Object.values(weights).reduce((a, b) => a + b, 0)
  let earned = 0
  for (const check of checks) {
    const w = weights[check.id] ?? 0
    if (check.status === 'pass') earned += w
    else if (check.status === 'warn') earned += w * 0.5
  }
  return Math.round((earned / total) * 100)
}
