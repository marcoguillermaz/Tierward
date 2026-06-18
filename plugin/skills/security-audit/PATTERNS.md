# Security Audit - Stack Patterns

Reference file for `/security-audit`. Contains grep patterns per check, organized by stack.
The executing agent reads this file at the start of Step 2 and Step 3e. For each check, select the patterns matching the detected stack. If no exact match, use Generic.

---

## A1 - Auth verification patterns

Grep for these within the first 20 lines of each route handler.

| Stack | Patterns |
|---|---|
| Node.js (Express/Fastify) | `getSession\|getUser\|req.user\|req.session\|auth()\|currentUser` |
| Next.js | `getServerSession\|auth()\|getUser\|currentUser\|cookies().get` |
| Django | `request.user\|login_required\|permission_required\|IsAuthenticated` |
| Rails | `current_user\|authenticate_user!\|before_action :authenticate` |
| Laravel | `Auth::user()\|auth()->user()\|$request->user()\|middleware('auth')` |
| Flask | `current_user\|login_required\|flask_login\|g.user` |
| Go | `r.Context().Value\|middleware.Auth\|session.Get\|claims.` |
| Swift (Vapor) | `req.auth.require\|req.auth.get\|guardMiddleware` |
| Kotlin (Ktor) | `call.principal\|authenticate\|call.sessions.get` |
| Java (Spring) | `@PreAuthorize\|SecurityContextHolder\|@Secured\|Principal` |
| .NET | `[Authorize]\|User.Identity\|HttpContext.User\|ClaimsPrincipal` |
| Ruby (Sinatra) | `session[:user]\|env['warden']\|current_user` |
| Generic | `auth\|session\|token\|currentUser\|current_user\|getUser\|get_user` |

---

## A3 - Validation library patterns

Grep for these in write route handlers (POST/PUT/PATCH).

| Stack | Validation call | Schema declaration |
|---|---|---|
| Node.js (Zod) | `safeParse\|\.parse(` | `z\.object\|z\.string` |
| Node.js (Joi) | `validate(\|Joi\.object` | `Joi\.string\|Joi\.number` |
| Node.js (class-validator) | `validate(\|plainToInstance` | `@IsString\|@IsNumber\|@IsNotEmpty` |
| Django / DRF | `is_valid()\|serializer\.validate` | `Serializer\|Form\.is_valid` |
| Rails | `params\.require\|params\.permit` | `validates\|validate` |
| Laravel | `$request->validate\|Validator::make` | `FormRequest\|rules()` |
| Flask (Marshmallow) | `schema\.load(\|schema\.dump(` | `Schema\|fields\.` |
| Go | `Validate(\|binding:"required"` | `validator\.New()` |
| Swift (Vapor) | `try req.content.decode\|Validatable` | `validations()` |
| Kotlin (Ktor) | `call.receive<\|validate {` | `@field:NotBlank\|@field:Size` |
| Java (Spring) | `@Valid\|BindingResult\|@Validated` | `@NotNull\|@Size\|@Pattern` |
| .NET | `ModelState.IsValid\|[Required]` | `FluentValidation\|DataAnnotations` |
| Generic | `validate\|parse\|sanitize\|schema\|is_valid` |

---

## A4 - SQL injection / query interpolation patterns

Grep for unsafe query construction.

| Stack | Unsafe patterns |
|---|---|
| Node.js (template literals) | `` `SELECT.*\$\{`` , `` `INSERT.*\$\{`` , `.where('col = ' + val)` |
| Python (f-strings) | `f"SELECT.*{` , `f"INSERT.*{` , `"SELECT.*" %` , `"SELECT.*".format(` |
| Ruby (interpolation) | `"SELECT.*#{` , `.where("col = #{` |
| Go | `fmt.Sprintf("SELECT.*%s` , `"SELECT.*" +` |
| Java | `"SELECT.*" +` , `String.format("SELECT.*%s` |
| PHP/Laravel | `DB::raw(".*$` , `"SELECT.*" . $` |
| Generic | `SELECT.*\+\|INSERT.*\+\|UPDATE.*\+\|DELETE.*\+` (string concat in queries) |

---

## A5 - Select-all / over-fetch patterns

Grep for routes returning full objects without field filtering.

| Stack | Select-all patterns |
|---|---|
| SQL (any) | `SELECT \*` |
| Supabase JS | `.select('*')\|.select(\`*\`)` |
| Prisma | `findMany()\|findFirst()\|findUnique()` (without explicit `select:`) |
| Django ORM | `.all()\|.values()\|.filter(` (without `.only(` or `.values(` with fields) |
| SQLAlchemy | `session.query(Model).all()\|select(Model)` |
| ActiveRecord | `.all\|.find(\|.where(` (without `.select(`) |
| Sequelize | `.findAll()\|.findOne()` (without `attributes:`) |
| Drizzle | `select()\|.from(` (without explicit column list) |
| Go (sqlx) | `Select(&\|Get(&` (check if struct has sensitive fields) |
| Generic | `SELECT \*\|findAll\|find_all\|\.all()` |

---

## A8 - Client-exposed environment variable prefixes

These framework prefixes inline env vars into the client bundle. Grep `.env*` files and source for these prefixes combined with secret-like suffixes.

| Framework | Client prefix |
|---|---|
| Next.js | `NEXT_PUBLIC_` |
| Vite / SvelteKit / Nuxt 3 | `VITE_` |
| Create React App | `REACT_APP_` |
| Nuxt 2 | `NUXT_ENV_` |
| Angular | Env vars in `environment.ts` (no prefix convention - check `environment.prod.ts`) |
| Expo / React Native | `EXPO_PUBLIC_` |
| Flutter | Dart env via `--dart-define` (no prefix - check `main.dart` for hardcoded values) |
| Generic | Any env var embedded in client-facing source files |

Secret-like suffixes to flag: `KEY`, `SECRET`, `TOKEN`, `PASSWORD`, `CREDENTIALS`, `PRIVATE`.

---

## A9 - Client-side file markers + privileged credential patterns

### Client-side markers (how to identify client-rendered files)

| Stack | Marker |
|---|---|
| Next.js | `'use client'` directive |
| Nuxt | `<script setup>` in pages (auto-client) |
| SvelteKit | files in `src/routes/` without `+page.server` |
| Angular | files in `src/app/` (all client-rendered by default) |
| React SPA | all `.tsx`/`.jsx` files (no SSR) |
| Native | N/A (no client/server split) |

### Privileged credential references

| Category | Patterns |
|---|---|
| Supabase | `SERVICE_ROLE\|service_role\|serviceRoleKey\|supabase_service_role` |
| Firebase | `FIREBASE_ADMIN\|admin\.initializeApp\|admin\.auth()` |
| AWS | `AWS_SECRET_ACCESS_KEY\|secretAccessKey` |
| Generic | `ADMIN_KEY\|MASTER_KEY\|masterKey\|PRIVATE_KEY\|server_secret` |

---

## A10 - Public URL patterns for storage assets

| Stack | Public URL pattern |
|---|---|
| Supabase Storage | `getPublicUrl\|createSignedUrl` (flag `getPublicUrl` on private assets) |
| AWS S3 | `s3.getSignedUrl\|getObject\|putObject` (flag direct S3 URL construction without signing) |
| GCS | `storage.googleapis.com\|getSignedUrl\|generateSignedUrl` |
| Azure Blob | `generateBlobSASQueryParameters\|blob.url` |
| Cloudflare R2 | `getPresignedUrl\|createSignedUrl` |
| Generic | Direct URL construction for storage assets without a signing/TTL mechanism |

---

## A13 - Identity resolution patterns

Reuse A1 patterns. Grep for the auth verification call to determine how the caller's identity is resolved.

---

## NS4 - Platform-specific security checks

### Swift (iOS / macOS)

| Check | Grep pattern | Flag condition |
|---|---|---|
| Keychain vs UserDefaults | `UserDefaults.*password\|UserDefaults.*token\|UserDefaults.*secret\|UserDefaults.*key` | Secrets stored in UserDefaults instead of Keychain |
| ATS exceptions | `NSAppTransportSecurity.*NSAllowsArbitraryLoads` in Info.plist | ATS disabled without justification |
| Data Protection | `FileProtectionType\|NSFileProtection` | Sensitive files without Data Protection |
| Entitlements | `.entitlements` file entries | Any entitlement not justified by feature |
| Hardened Runtime | `com.apple.security.cs.disable-library-validation` | Hardened Runtime exceptions |
| TCC descriptions | `NS.*UsageDescription` in Info.plist | Missing usage description for protected resources |

### Kotlin (Android)

| Check | Grep pattern | Flag condition |
|---|---|---|
| Keystore vs SharedPreferences | `SharedPreferences.*password\|SharedPreferences.*token\|SharedPreferences.*secret` | Secrets in SharedPreferences instead of Keystore |
| Certificate pinning | `network-security-config\|CertificatePinner` | Missing certificate pinning config |
| ProGuard/R8 | `minifyEnabled\s+true\|isMinifyEnabled\s*=\s*true` in build.gradle | ProGuard/R8 disabled for release |
| ContentProvider export | `exported="true"` in AndroidManifest.xml | ContentProvider exported without auth |
| WebView JS | `setJavaScriptEnabled(true)` | JavaScript enabled in WebView by default |

### Rust

| Check | Grep pattern | Flag condition |
|---|---|---|
| Unsafe blocks | `unsafe\s*\{` | Missing safety justification comment |
| FFI boundaries | `extern "C"\|#\[no_mangle\]` | Missing input validation at FFI boundary |
| Constant-time comparison | `==.*secret\|==.*token\|==.*password` | Direct equality for secrets (use `constant_time_eq`) |

### Go

| Check | Grep pattern | Flag condition |
|---|---|---|
| SQL injection | `fmt.Sprintf.*SELECT\|fmt.Sprintf.*INSERT\|"SELECT.*" +` | String concatenation in SQL queries |
| Context cancellation | `context.Background()\|context.TODO()` in request handlers | Missing context propagation |
| Crypto stdlib | `crypto/md5\|crypto/sha1\|crypto/des` | Weak crypto algorithms |

### Python

| Check | Grep pattern | Flag condition |
|---|---|---|
| SQL injection | `f"SELECT.*{\|f"INSERT.*{\|"SELECT.*" %\|cursor.execute.*%` | f-strings or % formatting in SQL |
| Subprocess injection | `subprocess.*shell=True\|os.system(\|os.popen(` | User input in shell commands |
| Pickle on untrusted | `pickle.load\|pickle.loads` | Pickle on external/untrusted data |
| SSRF | `requests.get(\|urllib.*urlopen(` with user-controlled URL | URL from user input without allowlist |

### Ruby

| Check | Grep pattern | Flag condition |
|---|---|---|
| Strong parameters | `params\[` without `params.require` or `params.permit` | Unfiltered params access |
| CSRF protection | `skip_before_action :verify_authenticity_token` | CSRF protection disabled |
| SQL interpolation | `.where(".*#{` | String interpolation in where() |
| Cookie settings | `secure:\s*false\|httponly:\s*false` | Insecure cookie settings |

### Java

| Check | Grep pattern | Flag condition |
|---|---|---|
| Deserialization | `ObjectInputStream\|readObject()` | Deserialization of untrusted data |
| PreparedStatement | `Statement.*execute\|createStatement` (not `PreparedStatement`) | Non-parameterized SQL |
| XXE prevention | `DocumentBuilderFactory\|SAXParserFactory` without `setFeature.*disallow-doctype-decl` | XML parsing without XXE prevention |
| SecureRandom | `new Random()\|Math.random()` in security context | Weak RNG for security operations |

### .NET

| Check | Grep pattern | Flag condition |
|---|---|---|
| Secret storage | `appsettings.*password\|appsettings.*secret\|appsettings.*connectionstring` (case-insensitive) | Secrets in appsettings.json instead of Secret Manager/Key Vault |
| Anti-forgery | `[IgnoreAntiforgeryToken]\|ValidateAntiForgeryToken` absence | Missing anti-forgery on form endpoints |
| HTTPS enforcement | `UseHttpsRedirection` absence in `Program.cs` | HTTPS not enforced |
| Error details | `UseDeveloperExceptionPage` in production config | Stack traces exposed in production |
