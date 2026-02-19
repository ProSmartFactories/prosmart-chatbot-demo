# Guia Completa: Conectar Supabase Auth OTP con SMTP de Hostinger

## Proyecto de referencia: ProSmart Factories Demo
**Fecha**: Febrero 2026
**Autor**: Victor (ProSmart Factories)
**Uso**: Replicar en Google Antigravity u otro proyecto

---

## Indice

1. [Requisitos previos](#1-requisitos-previos)
2. [Configurar email en Hostinger](#2-configurar-email-en-hostinger)
3. [Configurar SMTP en Supabase Dashboard](#3-configurar-smtp-en-supabase-dashboard)
4. [Configurar Auth en Supabase Dashboard](#4-configurar-auth-en-supabase-dashboard)
5. [Configurar Rate Limits](#5-configurar-rate-limits)
6. [Personalizar Email Templates](#6-personalizar-email-templates)
7. [Codigo Frontend - Cliente Supabase](#7-codigo-frontend---cliente-supabase)
8. [Codigo Frontend - Enviar OTP](#8-codigo-frontend---enviar-otp)
9. [Codigo Frontend - Verificar OTP](#9-codigo-frontend---verificar-otp)
10. [Codigo Frontend - Componente LoginForm](#10-codigo-frontend---componente-loginform)
11. [Codigo Frontend - Componente OTPInput](#11-codigo-frontend---componente-otpinput)
12. [Codigo Frontend - Auth Context completo](#12-codigo-frontend---auth-context-completo)
13. [Troubleshooting - Problemas comunes](#13-troubleshooting---problemas-comunes)
14. [Verificacion final](#14-verificacion-final)

---

## 1. Requisitos previos

Antes de empezar necesitas:

- [ ] Cuenta de Hostinger con plan de email activo
- [ ] Dominio verificado en Hostinger (ej: `tudominio.com`)
- [ ] Proyecto de Supabase creado (free tier funciona)
- [ ] Proyecto frontend con `@supabase/supabase-js` instalado

### Paquetes necesarios (frontend Next.js)

```bash
npm install @supabase/supabase-js
```

### Variables de entorno necesarias

```env
# .env.local (frontend)
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROJECT-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...tu-anon-key
```

---

## 2. Configurar email en Hostinger

### Paso 2.1: Crear cuenta de email en Hostinger

1. Ir a **Hostinger Panel** > **Emails** > **Cuentas de email**
2. Crear una cuenta de email dedicada para OTP:
   - **Email recomendado**: `no-reply@tudominio.com`
   - **Password**: genera una contrasena segura (la necesitaras despues)
3. **IMPORTANTE**: NO uses tu email personal, crea uno especifico para envios automaticos

### Paso 2.2: Obtener credenciales SMTP de Hostinger

Las credenciales SMTP de Hostinger son siempre las mismas:

| Campo | Valor |
|-------|-------|
| **SMTP Host** | `smtp.hostinger.com` |
| **SMTP Port** | `587` |
| **Encryption** | STARTTLS (se negocia automaticamente con puerto 587) |
| **SMTP User** | `no-reply@tudominio.com` (el email completo) |
| **SMTP Pass** | La contrasena que creaste para ese email |

### Paso 2.3: Verificar que el email funciona

Antes de conectar a Supabase, verifica que el email envia correctamente:

1. Inicia sesion en **Hostinger Webmail** con `no-reply@tudominio.com`
2. Envia un email de prueba a tu email personal
3. **Si llega** -> las credenciales son correctas, continua
4. **Si NO llega** -> revisa contrasena, verifica que el dominio tenga registros MX activos

---

## 3. Configurar SMTP en Supabase Dashboard

Este es el paso MAS CRITICO. Aqui es donde la mayoria de proyectos fallan.

### Paso 3.1: Ir a configuracion SMTP

1. Ir a [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Seleccionar tu proyecto
3. Ir a **Authentication** (menu lateral izquierdo)
4. Ir a la pestana **SMTP Settings** (o en versiones nuevas: **Settings** > **SMTP**)

### Paso 3.2: Habilitar Custom SMTP

1. Activar el toggle **"Enable Custom SMTP"**
2. Llenar los campos EXACTAMENTE asi:

| Campo en Supabase | Valor a ingresar |
|---|---|
| **Sender email** | `no-reply@tudominio.com` |
| **Sender name** | `Tu Empresa` (ej: "Google Antigravity") |
| **Host** | `smtp.hostinger.com` |
| **Port number** | `587` |
| **Username** | `no-reply@tudominio.com` |
| **Password** | La contrasena del email de Hostinger |
| **Minimum interval between emails** | `60` (segundos, ajustar segun necesidad) |

### Paso 3.3: ERRORES COMUNES en este paso

> **ERROR: Usar puerto 465 en vez de 587**
> - Puerto 465 = SSL directo (Supabase NO lo soporta bien)
> - Puerto 587 = STARTTLS (es el que Supabase espera)
> - **SIEMPRE usar 587**

> **ERROR: Username incompleto**
> - MAL: `no-reply`
> - BIEN: `no-reply@tudominio.com` (email completo con dominio)

> **ERROR: Sender email diferente al username**
> - El "Sender email" y el "Username" DEBEN ser el mismo email
> - Si son diferentes, Hostinger rechazara el envio

### Paso 3.4: Guardar y probar

1. Click en **Save**
2. Supabase puede tardar 1-2 minutos en aplicar los cambios
3. **NO hay boton de "Test" en el dashboard** - la prueba se hace desde el frontend o la API

---

## 4. Configurar Auth en Supabase Dashboard

### Paso 4.1: Configurar Email Auth

1. Ir a **Authentication** > **Providers**
2. Expandir **Email**
3. Configurar:

| Opcion | Valor | Explicacion |
|--------|-------|-------------|
| **Enable Email Signup** | ON | Permitir registro por email |
| **Enable Email Confirmations** | OFF | **CRITICO**: Si esta ON, el usuario necesita confirmar email antes de poder hacer login. Para OTP puro, dejalo OFF |
| **Enable email OTP (passwordless)** | ON | Esto permite `signInWithOtp` |
| **Secure email change** | ON | Seguridad adicional |
| **Double confirm email changes** | ON | Seguridad adicional |

### Paso 4.2: Sobre "Enable Email Confirmations"

**ATENCION**: Este campo causa MUCHA confusion:

- **Si esta ON**: Despues de `signUp()`, el usuario recibe un email con un LINK de confirmacion. Hasta que no haga click, NO puede hacer login. El OTP (`signInWithOtp`) funciona INDEPENDIENTEMENTE de esto.
- **Si esta OFF**: El usuario puede hacer login inmediatamente despues de registrarse.

**Para flujo SOLO OTP (sin password)**: Puedes dejarlo OFF porque el OTP ya verifica el email.

**Para flujo password + OTP**: Puedes dejarlo ON para que confirmen por link Y despues pedir OTP como segundo factor.

**En ProSmart usamos**: OFF (flujo puro OTP, sin passwords)

---

## 5. Configurar Rate Limits

### Paso 5.1: En Supabase Dashboard

1. Ir a **Authentication** > **Rate Limits**
2. Configurar:

| Rate Limit | Valor recomendado | Explicacion |
|------------|-------------------|-------------|
| **Rate limit for sending emails** | `5` per hour | Cuantos emails OTP puede solicitar un usuario por hora |
| **Rate limit for sending SMS** | `30` per hour | No aplica si solo usas email |
| **Rate limit for token refresh** | `150` per 5 min | Dejar default |
| **Rate limit for sign-in/sign-up** | `30` per 5 min | Dejar default |
| **Rate limit for token verifications** | `30` per 5 min | Cuantas veces puede intentar verificar OTP |

### Paso 5.2: IMPORTANTE sobre Rate Limits

> **PROBLEMA COMUN**: Supabase tiene un rate limit DEFAULT de `2 emails por hora` en el plan gratuito.
> Si estas probando y envias 3 OTPs seguidos, el tercero FALLARA SILENCIOSAMENTE.
>
> **SOLUCION**: En el dashboard, sube el limite a `5` o `10` para desarrollo.
> En produccion, `3-5` por hora es razonable.

---

## 6. Personalizar Email Templates

### Paso 6.1: Ir a Email Templates

1. Ir a **Authentication** > **Email Templates**
2. Seleccionar **Magic Link** (este es el template que usa `signInWithOtp`)

### Paso 6.2: Template recomendado para OTP

Supabase usa la variable `{{ .Token }}` para insertar el codigo OTP de 6 digitos.

```html
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .code { font-size: 36px; font-weight: bold; letter-spacing: 8px; text-align: center; color: #333; padding: 20px; background: #f0f0f0; border-radius: 8px; margin: 20px 0; }
    .footer { text-align: center; color: #999; font-size: 12px; margin-top: 30px; }
    h2 { color: #333; text-align: center; }
    p { color: #666; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Codigo de verificacion</h2>
    <p>Tu codigo de acceso es:</p>
    <div class="code">{{ .Token }}</div>
    <p>Este codigo expira en 1 hora. No compartas este codigo con nadie.</p>
    <p>Si no solicitaste este codigo, ignora este mensaje.</p>
    <div class="footer">
      &copy; 2026 Tu Empresa. Todos los derechos reservados.
    </div>
  </div>
</body>
</html>
```

### Paso 6.3: Configurar Subject del email

En el mismo formulario del template:
- **Subject**: `Tu codigo de verificacion: {{ .Token }}`

> **TIP**: Incluir el codigo en el subject permite al usuario verlo sin abrir el email (desde la notificacion del telefono).

### Paso 6.4: Configurar OTP Length

1. Ir a **Authentication** > **Settings** (o en URL Settings)
2. Buscar **OTP Length**: `6` (default, dejarlo asi)
3. Buscar **OTP Expiry**: `3600` (1 hora en segundos)

---

## 7. Codigo Frontend - Cliente Supabase

### Paso 7.1: Crear archivo `lib/supabase.ts`

```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    // IMPORTANTE para Next.js App Router:
    // Quitar el signal de abort para evitar errores
    // "AbortError: signal is aborted without reason"
    // Esto pasa porque Next.js cancela fetch durante re-renders
    fetch: (url, options = {}) => {
      const { signal, ...rest } = options as RequestInit;
      return fetch(url, rest);
    },
  },
});
```

> **NOTA CRITICA**: El hack de `signal` es necesario en Next.js 14/15 con App Router.
> Sin esto, veras errores de `AbortError` aleatorios cuando el auth listener
> re-renderiza componentes.

---

## 8. Codigo Frontend - Enviar OTP

### Paso 8.1: La funcion `signInWithOtp`

Esta es la funcion que ENVIA el email con el codigo OTP:

```typescript
const sendOtp = async (email: string) => {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,  // Si el email no existe, crea el usuario automaticamente
    },
  });
  return { error: error as Error | null };
};
```

### Paso 8.2: Que hace `signInWithOtp` internamente

1. Supabase recibe el email
2. Si `shouldCreateUser: true` y el email no existe -> crea un usuario nuevo en `auth.users`
3. Genera un codigo OTP de 6 digitos
4. Usa tu SMTP configurado (Hostinger) para enviar el email
5. Guarda el hash del OTP en la base de datos con expiracion de 1 hora
6. Devuelve `{ error: null }` si todo salio bien

### Paso 8.3: Posibles errores

| Error | Causa | Solucion |
|-------|-------|----------|
| `Email rate limit exceeded` | Enviaste muchos OTP seguidos | Esperar o subir rate limit en dashboard |
| `Signups not allowed for otp` | OTP no esta habilitado | Habilitar en Authentication > Providers > Email |
| `Error sending email` | SMTP mal configurado | Revisar Seccion 3 de esta guia |
| Sin error pero email no llega | Rate limit silencioso o SMTP | Revisar logs en dashboard y rate limits |

---

## 9. Codigo Frontend - Verificar OTP

### Paso 9.1: La funcion `verifyOtp`

Esta funcion VERIFICA el codigo que el usuario ingreso:

```typescript
const verifyOtp = async (email: string, token: string) => {
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',  // IMPORTANTE: debe ser 'email', NO 'sms'
  });
  return { error: error as Error | null };
};
```

### Paso 9.2: Que hace `verifyOtp` internamente

1. Supabase recibe email + token (el codigo de 6 digitos)
2. Busca el OTP asociado a ese email
3. Compara el hash
4. Si coincide Y no ha expirado:
   - Marca el email como verificado
   - Crea una sesion (JWT access_token + refresh_token)
   - Dispara el evento `SIGNED_IN` en el auth listener
5. Si NO coincide: devuelve error

### Paso 9.3: Parametro `type` - MUY IMPORTANTE

| type | Cuando usar |
|------|-------------|
| `'email'` | Cuando enviaste OTP por email con `signInWithOtp({ email })` |
| `'sms'` | Cuando enviaste OTP por SMS (no aplica aqui) |
| `'magiclink'` | NO usar - es para magic links, no OTP |
| `'signup'` | Cuando el OTP fue enviado como parte de un `signUp()` |

**Para nuestro flujo (email OTP puro), SIEMPRE usar `type: 'email'`**

---

## 10. Codigo Frontend - Componente LoginForm

Este componente captura el email y envia el OTP:

```tsx
// components/auth/LoginForm.tsx
'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

interface LoginFormProps {
  onSuccess: (email: string) => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Enviar OTP al email del usuario
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      // OTP enviado exitosamente, pasar al paso de verificacion
      onSuccess(email);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@empresa.com"
          required
        />
      </div>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <button type="submit" disabled={loading || !email}>
        {loading ? 'Enviando...' : 'Enviar codigo'}
      </button>

      <p>Te enviaremos un codigo de verificacion de 6 digitos</p>
    </form>
  );
}
```

### Flujo del componente:

```
1. Usuario escribe su email
2. Click "Enviar codigo"
3. Se llama signInWithOtp({ email })
4. Supabase envia OTP via Hostinger SMTP
5. Si exito -> llama onSuccess(email) para pasar al componente OTPInput
6. Si error -> muestra mensaje de error
```

---

## 11. Codigo Frontend - Componente OTPInput

Este componente captura y verifica el codigo de 6 digitos:

```tsx
// components/auth/OTPInput.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface OTPInputProps {
  email: string;
  onSuccess: () => void;
  onBack: () => void;
}

export function OTPInput({ email, onSuccess, onBack }: OTPInputProps) {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Auto-focus primer input al montar
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Manejar cambio en cada input
  const handleChange = (index: number, value: string) => {
    // Solo permitir digitos
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value.slice(-1); // Solo ultimo caracter
    setOtp(newOtp);

    // Auto-focus siguiente input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit cuando se completan los 6 digitos
    if (newOtp.every(digit => digit) && newOtp.join('').length === 6) {
      handleSubmit(newOtp.join(''));
    }
  };

  // Manejar backspace
  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // Manejar pegado (paste) del codigo completo
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pastedData.length === 6) {
      const newOtp = pastedData.split('');
      setOtp(newOtp);
      handleSubmit(pastedData);
    }
  };

  // Verificar OTP
  const handleSubmit = async (code: string) => {
    if (loading) return; // Prevenir doble envio
    setError(null);
    setLoading(true);

    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: 'email',  // CRITICO: debe ser 'email'
      });

      if (error) {
        setError('Codigo invalido. Intenta de nuevo.');
        setOtp(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
        setLoading(false);
      } else {
        // EXITO - usuario autenticado
        // Supabase automaticamente crea la sesion
        // El auth listener detectara SIGNED_IN
        onSuccess();
      }
    } catch {
      setError('Error de conexion. Intenta de nuevo.');
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
      setLoading(false);
    }
  };

  // Reenviar OTP
  const handleResend = async () => {
    setError(null);
    await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    setOtp(['', '', '', '', '', '']);
    inputRefs.current[0]?.focus();
  };

  return (
    <div>
      <p>Codigo enviado a <strong>{email}</strong></p>

      <div onPaste={handlePaste} style={{ display: 'flex', gap: '8px' }}>
        {otp.map((digit, index) => (
          <input
            key={index}
            ref={(el) => { inputRefs.current[index] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            disabled={loading}
            style={{
              width: '48px',
              height: '56px',
              textAlign: 'center',
              fontSize: '24px',
              fontWeight: 'bold',
              border: '2px solid #ccc',
              borderRadius: '12px',
            }}
          />
        ))}
      </div>

      {loading && <p>Verificando...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <button onClick={handleResend}>Reenviar codigo</button>
      <button onClick={onBack}>Usar otro email</button>
    </div>
  );
}
```

### Flujo del componente:

```
1. Se muestra con 6 inputs vacios
2. Auto-focus en el primer input
3. Usuario escribe digitos (auto-avanza al siguiente)
4. O pega el codigo completo (auto-detecta paste)
5. Cuando los 6 digitos estan completos -> auto-submit
6. Se llama verifyOtp({ email, token, type: 'email' })
7. Si exito -> onSuccess() (redirigir al app)
8. Si error -> limpiar inputs y mostrar error
9. Boton "Reenviar" -> llama signInWithOtp de nuevo
```

---

## 12. Codigo Frontend - Auth Context completo

Este es el Auth Context que conecta todo el sistema de autenticacion:

```tsx
// lib/auth.tsx
'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  sendOtp: (email: string) => Promise<{ error: Error | null }>;
  verifyOtp: (email: string, token: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Timeout de seguridad: si auth tarda mas de 5s, dejar de cargar
    const timeout = setTimeout(() => {
      console.warn('[Auth] Timeout - forzando loading=false');
      setLoading(false);
    }, 5000);

    // Obtener sesion inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(timeout);
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    }).catch((err) => {
      clearTimeout(timeout);
      console.error('[Auth] Error obteniendo sesion:', err);
      setLoading(false);
    });

    // Escuchar cambios de autenticacion
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        console.log('[Auth] Cambio de estado:', _event);
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  // Enviar OTP por email
  const sendOtp = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
      },
    });
    return { error: error as Error | null };
  };

  // Verificar codigo OTP
  const verifyOtp = async (email: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });
    return { error: error as Error | null };
  };

  // Cerrar sesion
  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, session, loading, signOut, sendOtp, verifyOtp }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// Hook para usar en cualquier componente
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return context;
}
```

### Uso del AuthProvider:

```tsx
// app/layout.tsx
import { AuthProvider } from '@/lib/auth';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
```

---

## 13. Troubleshooting - Problemas comunes

### Problema 1: "Email no llega"

**Diagnostico paso a paso:**

1. **Revisar Supabase Logs**:
   - Dashboard > **Logs** > **Auth Logs**
   - Buscar entradas con el email del usuario
   - Si ves `email_sent` -> el email salio de Supabase
   - Si ves errores SMTP -> la configuracion esta mal

2. **Revisar spam/junk**:
   - Los emails de dominios nuevos a veces van a spam
   - Revisar carpeta Spam en el email del usuario

3. **Revisar Rate Limits**:
   - Dashboard > **Authentication** > **Rate Limits**
   - Si enviaste muchos OTP de prueba, puedes estar bloqueado
   - Esperar 1 hora o subir el limite

4. **Verificar SMTP en dashboard**:
   - Ir a Authentication > SMTP Settings
   - Verificar que el toggle este ON
   - Verificar host: `smtp.hostinger.com`
   - Verificar puerto: `587`
   - Verificar usuario: email completo con dominio
   - Verificar contrasena: sin espacios extra

### Problema 2: "Error: Invalid login credentials"

- Este error aparece cuando llamas `signInWithPassword` pero el usuario fue creado con OTP (sin password)
- **Solucion**: Usa `signInWithOtp` en vez de `signInWithPassword` si tu flujo es solo OTP

### Problema 3: "Error: Token has expired or is invalid"

- El OTP expiro (default: 1 hora)
- O el usuario ya uso ese OTP (cada OTP solo se puede usar UNA vez)
- **Solucion**: Click en "Reenviar codigo" para generar uno nuevo

### Problema 4: "AbortError: signal is aborted without reason" (Next.js)

- Este error es de Next.js App Router, NO de Supabase
- Next.js aborta fetches durante re-renders
- **Solucion**: Usar el hack del `signal` en el cliente Supabase (ver Seccion 7)

### Problema 5: "Email rate limit exceeded"

```
Para plan gratuito de Supabase:
- Default: 2 emails por hora por usuario
- Maximo configurable: ~30 por hora

Para plan Pro:
- Configurable hasta limites mas altos
```

**Solucion**: Subir rate limit en dashboard o esperar

### Problema 6: "SMTP connection refused" o "Authentication failed"

Checklist:
- [ ] Host es `smtp.hostinger.com` (no `mail.tudominio.com`)
- [ ] Puerto es `587` (no `465`, no `25`)
- [ ] Username es el email COMPLETO (`no-reply@tudominio.com`)
- [ ] Password es EXACTA (cuidado con espacios, caracteres especiales)
- [ ] La cuenta de email existe y esta activa en Hostinger
- [ ] El dominio tiene registros MX configurados

### Problema 7: Los emails llegan pero con formato roto

- Ir a Authentication > Email Templates
- Verificar que el HTML es valido
- Probar con un template simple primero
- Verificar que `{{ .Token }}` esta presente (sin esta variable, el codigo no aparece)

---

## 14. Verificacion final

### Checklist completo antes de ir a produccion:

**Supabase Dashboard:**
- [ ] SMTP Custom habilitado con Hostinger
- [ ] Host: `smtp.hostinger.com`
- [ ] Puerto: `587`
- [ ] Username: email completo de Hostinger
- [ ] Password: correcta
- [ ] Sender email = Username
- [ ] Email Auth habilitado en Providers
- [ ] OTP habilitado
- [ ] OTP Length: 6
- [ ] OTP Expiry: 3600 (o lo que necesites)
- [ ] Rate limits configurados adecuadamente
- [ ] Email templates personalizados con `{{ .Token }}`

**Hostinger:**
- [ ] Cuenta de email `no-reply@tudominio.com` creada y activa
- [ ] Puedes hacer login en webmail con esas credenciales
- [ ] Dominio tiene registros MX activos
- [ ] DNS propagado (si el dominio es nuevo, esperar 24-48h)

**Frontend:**
- [ ] `@supabase/supabase-js` instalado
- [ ] Variables de entorno configuradas (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- [ ] Cliente Supabase creado con hack de `signal` (para Next.js)
- [ ] `signInWithOtp({ email, options: { shouldCreateUser: true } })` implementado
- [ ] `verifyOtp({ email, token, type: 'email' })` implementado
- [ ] Auth listener con `onAuthStateChange` configurado
- [ ] Componentes LoginForm y OTPInput funcionales

**Prueba end-to-end:**
1. [ ] Abrir la app
2. [ ] Ingresar un email real
3. [ ] Click "Enviar codigo"
4. [ ] Verificar que no hay error en la UI
5. [ ] Revisar bandeja de entrada del email (y spam)
6. [ ] Email llega con el codigo de 6 digitos
7. [ ] Ingresar el codigo en la UI
8. [ ] Verificacion exitosa -> usuario autenticado
9. [ ] Refrescar pagina -> sesion persiste
10. [ ] Cerrar sesion -> funciona correctamente

---

## Diagrama del flujo completo

```
USUARIO                    FRONTEND                    SUPABASE                    HOSTINGER SMTP
  |                           |                            |                            |
  |-- Ingresa email --------->|                            |                            |
  |                           |-- signInWithOtp(email) --->|                            |
  |                           |                            |-- Genera OTP 6 digitos     |
  |                           |                            |-- Conecta SMTP 587 ------->|
  |                           |                            |                            |-- Envia email
  |                           |<-- { error: null } --------|                            |
  |                           |                            |                            |
  |<-- "Codigo enviado" ------|                            |                            |
  |                           |                            |                            |
  |-- Recibe email con OTP ---|--------------------------------------------<------------|
  |                           |                            |                            |
  |-- Ingresa 6 digitos ----->|                            |                            |
  |                           |-- verifyOtp(email,code) -->|                            |
  |                           |                            |-- Verifica hash OTP        |
  |                           |                            |-- Crea sesion JWT          |
  |                           |<-- { session, user } ------|                            |
  |                           |                            |                            |
  |                           |-- onAuthStateChange ------>|                            |
  |                           |   (SIGNED_IN)              |                            |
  |                           |                            |                            |
  |<-- AUTENTICADO -----------|                            |                            |
```

---

## Resumen de credenciales SMTP necesarias

Para replicar en Google Antigravity, necesitas crear estas credenciales:

```env
# Credenciales SMTP de Hostinger para tu nuevo proyecto
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=587
SMTP_USER=no-reply@tu-nuevo-dominio.com
SMTP_PASS=tu-contrasena-segura
SMTP_FROM_NAME=Google Antigravity
SMTP_FROM_EMAIL=no-reply@tu-nuevo-dominio.com
```

Y configurarlas en el Supabase Dashboard del nuevo proyecto (Seccion 3).

---

*Guia creada basandose en la implementacion exitosa de ProSmart Factories Demo (Febrero 2026)*
