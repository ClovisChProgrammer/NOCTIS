# Catálogo de Tipos — Noctis IV / NIV+ (referência original)

Fonte principal: `Noctis-IV-Plus-master/source/NOCTIS-0.CPP` (complementos em `NOCTIS.CPP`, `NOCTIS-1.CPP`, `NOCTIS-D.H`, `DL.CPP`, `ST.CPP`).

## Constantes (definidas em vários módulos)
- `star_classes = 12` (índices 0..11) — `NOCTIS-D.H:140`, `DL.CPP:360`, `ST.CPP:358`.
- `planet_types = 10` — `NOCTIS-D.H:141`, `DL.CPP:361`, `ST.CPP:359`.
- `avgmoons = 4`, `log2avgmoons = 2`, `maxbodies = 20 * avgmoons` — `NOCTIS.SYM` (e cabeçalhos relacionados).
- Nota: `planet_description[]` e arrays planetários têm 11 entradas (índices 0..10); o tipo 10 é usado em código como “estrela companheira / not a planet”, embora `planet_types` seja definido como 10.

## Classes de estrelas (12)

### Descrições (`star_description[star_classes]`, `NOCTIS-0.CPP:893`)
| Classe | Descrição |
|---:|---|
| 0 | medium size, orange main sequence star, strong gravity well around. |
| 1 | large, white main sequence star, very strong gravity field. |
| 2 | red dwarf, small main sequence star, weak gravity well. |
| 3 | extremely large, blue supergiant, deadly gravity strength. |
| 4 | white giant star, intense gravity field. |
| 5 | yellowish dwarf, very weak gravity field around. |
| 6 | double star with a major yellowish dwarf component and a secondary blue dwarf, weak but irregular gravity. |
| 7 | red dwarf with a smaller, orbiting brown dwarf, very weak gravity. |
| 8 | large, red giant star, very strong gravity field around. |
| 9 | white dwarf star, intense gravity field. |
| 10 | very small, blue dwarf star, strong gravity well around. |
| 11 | tiny pulsar object, unsafe, high radiation, strong gravity. |

### Propriedades por classe (`NOCTIS-0.CPP:907,922,925,928,930`)
| Classe | Cor RGB base `class_rgb[3*i]` | `class_ray` | `class_rayvar` | `class_act` | `class_planets` (máx. planetas) |
|---:|---:|---:|---:|---:|---:|
| 0 | (255, 160, 96) | 5000 | 2000 | 2 | 12 |
| 1 | (255, 255, 255) | 15000 | 10000 | 4 | 18 |
| 2 | (255, 96, 64) | 300 | 200 | 1 | 8 |
| 3 | (128, 128, 255) | 20000 | 15000 | 6 | 15 |
| 4 | (255, 255, 255) | 15000 | 5000 | 5 | 20 |
| 5 | (255, 255, 128) | 1000 | 1000 | 10 | 3 |
| 6 | (255, 255, 192) | 3000 | 3000 | 100 | 0 |
| 7 | (255, 64, 32) | 2000 | 1000 | 1 | 1 |
| 8 | (255, 128, 32) | 4000 | 2000 | 2 | 7 |
| 9 | (255, 255, 255) | 1500 | 1000 | 1 | 20 |
| 10 | (128, 128, 255) | 30000 | 5000 | 10 | 2 |
| 11 | (128, 255, 128) | 250 | 0 | 1 | 5 |

- `class_act` e `class_ray/rayvar` aparecem associados à atividade/tamanho visual/raio da estrela; usos de render variam por módulo.

## Tipos de planetas/corpos orbitais

### Descrições (`planet_description[]`, `NOCTIS-0.CPP:952`, 11 entradas)
| Tipo | Descrição | Cor+var `planet_rgb_and_var` (R,G,B,var) | `avg_planet_ray` | `planet_possiblemoons` |
|---:|---|---:|---:|---:|
| 0 | medium size, internally hot, unstable surface, no atmosphere. | (60,30,15,20) | 0.007 | 1 |
| 1 | small, solid, dusty, craterized, no atmosphere. | (40,50,40,25) | 0.003 | 1 |
| 2 | medium size, solid, thick atmosphere, fully covered by clouds. | (32,32,32,32) | 0.010 | 2 |
| 3 | medium size, felisian, breathable atmosphere, suitable for life. | (16,32,48,40) | 0.011 | 3 |
| 4 | medium size, rocky, creased, no atmosphere. | (32,40,32,20) | 0.010 | 2 |
| 5 | small, solid, thin atmosphere. | (32,32,32,32) | 0.008 | 2 |
| 6 | large, not consistent, covered with dense clouds. (gigante gasoso) | (32,32,32,32) | 0.064 | 18 |
| 7 | small, solid, icy surface, no atmosphere. | (32,40,48,24) | 0.009 | 2 |
| 8 | medium size, surface is mainly native quartz, oxygen atmosphere. | (40,40,40,30) | 0.012 | 3 |
| 9 | very large, substellar object, not consistent. | (50,25,10,20) | 0.125 | 20 |
| 10 | companion star - not a planet. | (40,40,40,40) | 5.000 | 20 |

### Parâmetros globais de geração/orbital (`NOCTIS-0.CPP:978-985`)
- `planet_orb_scaling = 5.0`, `avg_planet_sizing = 2.4`
- `moon_orb_scaling = 12.8`, `avg_moon_sizing = 1.8`
- `mindiff = 0.01`

## Regras de geração (resumo, `NOCTIS-0.CPP` ~3972+ e 4096+)

### Seleção/quantidade
- Classe da estrela-alvo aleatória: `ap_target_class = random(star_classes)`.
- Número máximo de planetas por classe: `class_planets[class]`.
- Luas por corpo: `t = random(planet_possiblemoons[tipo] + 1)` com teto `maxbodies - nearstar_nob`.

### Atribuição/ajuste de tipos de luas (`nearstar_p_type[q]`, ~4201-4257)
- Tipo inicial aleatório: `random(planet_types)` (0..9).
- Tipo 9 (subestelar) como lua: permitido só se corpo-pai for estrela companheira (`s==10`), senão vira 2.
- Tipo 6 (gigante gasoso) como lua: só se pai for subestelar/estrela (`s >= 9`), senão vira 5.
- “Resfriamento” externo: se planeta `n>7` e sorteio, tende a 7 (gelado); `n>9` reforça.
- Luas grandes (2,3,4,8) só ao redor de gasoso/subestelar/estrela (`s==6 || s>=9`), senão viram 1.
- Habitáveis (3) como lua: restrições por distância/órbita e classe estelar (ex.: longe -> 7; classes 2/7/11 favorecem 8 em certos casos; classe 0 favorece habitabilidade; ajustes específicos no código).
- Geladas (7) excluídas em órbitas internas (`n <= 5` -> 1).
- Estrelas pequenas/frias (classes 2,5,7,11) aumentam chance de luas geladas.
- Campo persistido: `nearstar_p_type[q] = r` (resultado final).

### Normalização de órbitas/tamanhos
- Planetas (~4300-4316): raio base por `avg_planet_ray[tipo]` com variação, escalado por `avg_planet_sizing`; órbita base `key_radius = nearstar_ray * planet_orb_scaling` (ajustada por classe 8/2/7/11: ×2/×16/×18/×20); progressão tipo Kepler até 8º, depois acréscimo ~22% (`0.22 * nearstar_p_orb_ray[n]`) das anteriores.
- Luas (~4324-4341): base `key_radius = nearstar_p_ray[pai] * moon_orb_scaling`, escalas por `avg_moon_sizing`; Kepler limitado: <2 soma cheia, 2..7 soma 12%, >=8 soma 2.5%.
- Raios/órbitas sofrem correções adicionais por massa de gigantes internos (comentado no código).

### Anéis (`nearstar_p_ring`, ~4345-4361)
- Base: `0.75 * nearstar_p_ray[n] * (2 + random(3))`.
- Improváveis em corpos pequenos; mais prováveis em gigantes/subestelares (tipos 6,9): chance maior de manter anel (`random(2)` remove) vs outros (`random(5)` remove).

### Outros campos/uso no código
- Arrays por corpo: posição/orbita (`orb_*`, `orb_ray`, `orb_tilt`, `orb_ecc`, `orb_orient`), `tilt`, `seed`, `ray`, `ring`, `owner`, `moonid`, `rotation/rtperiod`, terminador etc. (`NOCTIS-0.CPP` ~932-951).
- `nearstar_p_type` usado em UI/lógica: descrições, restrições (tipos 0,6,>=9), estrela companheira (10), planeta habitável (3) para clima/biologia/UX (`NOCTIS.CPP`, `NOCTIS-1.CPP`).
- `starmass_correction[star_classes]` existe em `NOCTIS.CPP:2096` (tabela não transcrita aqui).

## Relação com dados do engine web (`noctis-engine`)
- `STARMAP.BIN`: registros de 32 bytes; byte 29 indica tipo (0x50 = planeta, senão estrela) e bytes 30-31 usados como `variant/slot` (ver `noctis-engine/src/galaxy/parse.ts`).
- `GUIDE.BIN`: nomes/descrições associados (carregados pelo engine).
- O engine atual renderiza estrelas/planetas como pontos com órbitas visuais e metadados do parser; **não implementa** toda a geração procedural/atributos físicos completos do original.

## Arquivos de referência úteis
- Código: `source/NOCTIS-0.CPP`, `NOCTIS.CPP`, `NOCTIS-1.CPP`, `defs.h`, `NOCTIS-0.H`, `NOCTIS-D.H`.
- Docs/dados: `source/docs/current bin format.txt`, `surface bin format.txt`, `NIVPLUS_CHANGES.TXT`, `source/OFFSETS.MAP`, `source/GLOBES.MAP`, `data/STARMAP.BIN`, `data/GUIDE.BIN`.
