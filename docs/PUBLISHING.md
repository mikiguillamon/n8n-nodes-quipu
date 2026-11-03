# Publicar desde GitHub a npm

## 1. Crear el repositorio y subir el proyecto

Crea un repositorio **público y vacío**, por ejemplo `n8n-nodes-quipu`. No añadas README, licencia ni `.gitignore` desde GitHub: ya existen en este proyecto.

En los comandos siguientes sustituye `TU_USUARIO` y `TU_REPOSITORIO` por los datos reales de GitHub. El usuario de GitHub puede ser distinto del usuario de npm.

```sh
cd "/Users/mikiguillamon/ZZ_Dev/N8N Nodes/N8N Quipu Custom Node"
npm pkg set repository.type=git
npm pkg set 'repository.url=git+https://github.com/TU_USUARIO/TU_REPOSITORIO.git'
npm pkg set 'homepage=https://github.com/TU_USUARIO/TU_REPOSITORIO#readme'
npm pkg set 'bugs.url=https://github.com/TU_USUARIO/TU_REPOSITORIO/issues'
git init -b main
git add .
git commit -m "Initial Quipu community node"
git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git
git push -u origin main
```

Estos comandos de inicialización son para esta carpeta todavía sin Git. Si ya la has sincronizado, conserva su historial y su remoto; no repitas la inicialización. `.gitignore` excluye dependencias, compilados, paquetes `.tgz` y archivos `.env`.

En GitHub, entra en **Actions → CI** y comprueba que pase. El workflow **Publish** se omite hasta que actives la variable del paso 4.

## 2. Primera publicación en npm

Utiliza Node 24 y una cuenta con permiso sobre el scope `@mikiguillamon`. Si tu usuario o la organización npm son otros, cambia `name` en `package.json`, actualiza el lockfile y las referencias al nombre antes del primer commit/publicación.

Desde la carpeta del proyecto y con los cambios ya subidos:

```sh
npm login
npm whoami
npm publish --access public
```

Completa el inicio de sesión y la verificación de npm en el navegador. `prepublishOnly` ejecuta lint, compilación, pruebas y comprobación del contrato antes de publicar. Esta primera publicación local crea `@mikiguillamon/n8n-nodes-quipu@0.1.0`; no lleva la procedencia de GitHub Actions. Las siguientes publicaciones automáticas sí la incluirán.

## 3. Conectar npm con GitHub Actions

En npm, abre el paquete → **Settings → Trusted Publisher / Trusted publishing → GitHub Actions**. Configura:

| Campo | Valor |
| --- | --- |
| Organization or user | Propietario real del repositorio en GitHub |
| Repository | Nombre del repositorio, sin URL |
| Workflow filename | `publish.yml`, sin `.github/workflows/` |
| Environment name | Vacío; este workflow no utiliza un environment |
| Allowed actions | Permitir publicación directa con `npm publish` |

No basta con permitir únicamente `npm stage publish`: este proyecto publica directamente. No necesitas crear un secret `NPM_TOKEN`.

Completa una primera publicación automática dentro de los dos días siguientes a crear el Trusted Publisher; si caduca antes de validarse, elimínalo y créalo de nuevo. Consulta los requisitos vigentes en la [documentación de npm](https://docs.npmjs.com/trusted-publishers/).

## 4. Activar y probar la publicación automática

En el repositorio de GitHub: **Settings → Secrets and variables → Actions → Variables → New repository variable**:

- Name: `NPM_PUBLISH_ENABLED`
- Value: `true`

Después crea un commit nuevo y súbelo. Para comprobar la conexión sin cambiar código:

```sh
git commit --allow-empty -m "Verify npm trusted publishing"
git push origin main
```

En **Actions → Publish**, verifica que el resultado sea correcto. Si la primera versión fue `0.1.0`, este push publicará `0.1.1`. Puedes ver la versión y el commit en el resumen de la ejecución. Si falla, corrige la configuración y usa **Re-run failed jobs**; no hace falta otro commit para repetir un intento fallido.

## 5. Uso diario y versiones

Cada push a `main` ejecuta las comprobaciones y, si pasan, publica una versión nueva. Un push con varios commits publica una versión; también publican los cambios de documentación. Las pull requests y otras ramas no publican.

```sh
git add .
git commit -m "Describe el cambio"
git push origin main
```

La versión patch se calcula a partir de la mayor versión estable publicada en npm, por ejemplo `0.1.1 → 0.1.2`. Si quieres iniciar una versión minor o major, escribe una versión superior a la publicada, como `npm version 0.2.0 --no-git-tag-version`, y sube `package.json` y `package-lock.json` junto con tus cambios.

El workflow modifica la versión únicamente en su copia temporal: no crea commits ni etiquetas automáticos. La versión del checkout local sirve como mínimo para la publicación; la versión efectiva está en npm y en el resumen de Actions. No vuelvas a publicar manualmente desde un checkout cuya versión ya exista en npm.

Las publicaciones se ejecutan de una en una, con una cola de hasta 100 ejecuciones pendientes. No se garantiza el orden de llegada original de los pushes. Un fallo de tests, autenticación o registro impide publicar; un reintento detecta commits ya publicados mediante el `gitHead` de npm. Evita ejecutar publicaciones manuales simultáneas.

Para detener publicaciones automáticas, cambia `NPM_PUBLISH_ENABLED` a `false`. CI seguirá ejecutándose. Esta configuración se valida localmente; la prueba real de GitHub/OIDC se completa en el paso 4.

Publicar en npm y obtener la verificación de n8n son procesos separados. La actualización de este paquete en tus instancias de n8n también se realiza por separado.
