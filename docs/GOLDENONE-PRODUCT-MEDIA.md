# Golden One Product Media Map

Generated from the owner-provided `产品资料` worksheet and `don't push/sitedata` media tree.

## Output

- Source media references: 434
- Unique R2 objects: 418
- Exact duplicate references removed within the same product series: 16
- Images: 414
- PDFs: 4
- Excluded non-media workbook: `products/Key Chain/皮钥匙扣/鑫车皮钥匙扣链接.xlsx`

The tracked machine-readable catalog is `src/data/product-media-catalog.json`. It keeps the product taxonomy, owner-supplied factual notes, series-to-media links, stable R2 object keys, and current public URLs. The private CSV and upload manifest remain under `don't push/sitedata/r2-upload/goldenone`.

## Background-removed product media

Public product-object photos and individual edge/plating option images use transparent WebP derivatives. Original R2 objects remain unchanged for rollback; do not delete them before the transparent set and product pages have been verified. Certificates, dimensions, packaging, logo-method, ribbon, hardware and comparison graphics retain their full background because removal could erase labels or measurement lines.

The tracked catalog stores each derivative under the source media object's `display` mapping. The ignored processing/upload package is `don't push/sitedata/r2-upload/goldenone-cutouts`. After processing completes:

```powershell
npm run media:apply:goldenone:cutouts
npm run media:upload:goldenone:cutouts -- --dry-run
npm run media:upload:goldenone:cutouts
```

The cutout uploader accepts the generated manifest, uses immutable content-hashed `cutout-v1` keys, records resumable upload state beside the manifest, and does not overwrite or delete original media.

## R2 Upload

From the repository root:

```powershell
npm run media:prepare:goldenone
npm run media:upload:goldenone -- --dry-run
npm run media:upload:goldenone
```

The uploader uses the project-installed Wrangler, uploads to bucket `goldenone` with bounded concurrency, records successful object hashes in an ignored state file, and safely resumes after interruption. Use `--force-all` only when every object must be replaced. The generated `upload.ps1` is a slower sequential fallback.

## Modeling Notes

- `_shared` objects describe category- or series-wide choices such as plating, edges, backing hardware, ribbon, packaging, dimensions, and logo methods.
- Gallery objects are examples for a specific product series. Model-looking filenames such as `LP005`, `CC09`, `DI027`, and `BB042` remain discoverable in the semantic object key.
- A mapped image is owner-provided media, not proof of a certification, customer, performance claim, price, availability, or lead time.
- Series marked `no-source-media` exist in the worksheet but currently have no matching image folder. Do not borrow another series image without owner review.
