# Globe lab assets

| File | Source | Licence | Processing |
|---|---|---|---|
| earth-day-8k.jpg | Solar System Scope, 8k_earth_daymap.jpg (based on NASA Blue Marble), https://www.solarsystemscope.com/textures/ | CC BY 4.0 | none |
| earth-night-4k.jpg | NASA Earth Observatory, Black Marble 2016 (3 km), BlackMarble_2016_3km.jpg | Public domain (NASA) | resized 13500x6750 to 4096x2048 |
| earth-normal-4k.jpg | Solar System Scope, 8k_earth_normal_map.tif | CC BY 4.0 | resized to 4096x2048 |
| earth-water-8k.png | Solar System Scope, 8k_earth_specular_map.tif (white = water) | CC BY 4.0 | 8-bit gray |
| earth-clouds-8k.jpg | Solar System Scope, 8k_earth_clouds.jpg | CC BY 4.0 | 8-bit gray |
| moon-2k.jpg | NASA SVS CGI Moon Kit (LRO LROC colour), https://svs.gsfc.nasa.gov/4720 | Public domain (NASA) | resized to 2048x1024 |
| milkyway-4k.jpg | NASA SVS Deep Star Maps 2020, starmap_2020_4k.exr, https://svs.gsfc.nasa.gov/4851 | Public domain (NASA) | 5x5 median (point stars removed), black level, exposure tone map. Equatorial: RA 0 at centre, RA increases left, Dec +90 top (checked: LMC, galactic centre) |
| stars.bin | Yale Bright Star Catalogue 5th ed. (BSC5), http://tdc-www.harvard.edu/catalogs/bsc5.html | Public domain | V <= 6.5, 8404 stars; Float32 LE x4: ra_deg, dec_deg, vmag, b_minus_v (missing B-V = 0.6) |

Blue Marble NG 21600 px (for HD tiles) was unreachable on 2026-11-15 (404 on NASA's new asset host), so HD tiles are not included.
