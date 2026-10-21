# SKILL: COPYWRITING COREY HAINES
**Versión:** 1.0 | **Activación:** `@skill copywriting`

---

## 1. ESTRUCTURA DE CONVERSIÓN: PROBLEMA → CONSECUENCIA → ALIVIO

### Fórmula Maestra (PAS Mejorado)
```
[PROBLEMA REAL Y ESPECÍFICO]
    ↓
[CONSECUENCIA COSTOSA Y TANGIBLE — Dolor cuantificado]
    ↓
[ALIVIO INMEDIATO CON LA MICRO-APP — Beneficio medible]
    ↓
[CTA ORIENTADO AL BENEFICIO]
```

### Plantilla por Sección

| Sección | Pregunta Guía | Ejemplo Micro-App (Gestión de Citas Clínica) |
|---------|---------------|---------------------------------------------|
| **Problema** | ¿Qué frustra al usuario *ahora mismo*? | "Pierdes 45 min/semana llamando pacientes para confirmar citas" |
| **Consecuencia** | ¿Qué pierde si no lo resuelve *hoy*? | "= 39 hrs/año perdidas + 12% no-shows = €12K facturación no recuperada" |
| **Alivio** | ¿Cómo la app resuelve *exactamente* eso? | "Recordatorios automáticos por WhatsApp/Email → 0 min manuales, 3% no-show" |
| **CTA** | ¿Qué gana *ahora* al actuar? | **"Recupera 39 hrs/año — Configura en 2 min"** |

---

## 2. PROHIBICIÓN ESTRICTA DE CLICHÉS CORPORATIVOS

### Lista Negra (Zero Tolerance)
| ❌ Prohibido | ✅ Alternativa Específica |
|--------------|---------------------------|
| "Soluciones innovadoras" | "Automatiza recordatorios en 2 clics" |
| "Revolucionando la industria" | "Reduce no-shows del 12% al 3%" |
| "Plataforma integral" | "Gestiona citas, recordatorios e historial en una vista" |
| "Tecnología de vanguardia" | "WhatsApp Business API + n8n + Supabase" |
| "Experiencia de usuario excepcional" | "Configuración en 2 min, sin código" |
| "Líder en el mercado" | "Usado por 47 clínicas en Latam" |
| "Sinergias" / "Paradigma" / "Holístico" | **Eliminar. Usar verbos de acción.** |
| "Potenciar" / "Empoderar" / "Habilitar" | "Ahorra", "Reduce", "Elimina", "Acelera" |

### Regla de Verificación
> **Antes de commit:** `grep -r "innovadora\|revolucionar\|integral\|vanguardia\|excepcional\|líder\|sinergia\|holístico\|potenciar\|empoderar" --include="*.tsx" --include="*.md"` → **Debe retornar 0 resultados.**

---

## 3. BOTONES CTA — ORIENTADOS AL BENEFICIO INMEDIATO

### Fórmula CTA: `[VERBO DE ACCIÓN] + [BENEFICIO CUANTIFICADO] + [BAJA FRICCIÓN]`

| ❌ Genérico | ✅ Específico (Alto CTR) | Por Qué Funciona |
|-------------|--------------------------|------------------|
| "Comenzar" | **"Ahorra 5 hrs/semana — Gratis 14 días"** | Beneficio + urgencia suave + riesgo cero |
| "Registrarse" | **"Configura recordatorios en 2 min"** | Tiempo bajo + resultado tangible |
| "Contactar ventas" | **"Ver demo de 90 seg → Sin formulario"** | Inmediatez + sin fricción |
| "Más información" | **"Ver cómo clínica X recuperó €12K/año"** | Prueba social + curiosidad |
| "Suscribirse" | **"Prueba gratis 14 días — Cancela 1 clic"** | Reversibilidad + bajo compromiso |

### Jerarquía Visual CTA (Tokens UI)
```css
/* Primary CTA — Una sola por vista */
.cta-primary {
  @apply px-6 py-3 rounded-lg font-semibold text-base
         bg-primary-600 text-white
         hover:bg-primary-700 active:bg-primary-800
         focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
         transition-colors duration-150;
}

/* Secondary CTA — Alternativa de baja fricción */
.cta-secondary {
  @apply px-6 py-3 rounded-lg font-medium text-base
         bg-transparent border-2 border-primary-600 text-primary-600
         hover:bg-primary-50 active:bg-primary-100
         focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2;
}

/* Ghost CTA — "No, gracias" o acción secundaria */
.cta-ghost {
  @apply px-4 py-2 rounded-lg font-medium text-sm
         text-muted hover:text-primary-600
         focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2;
}
```

---

## 4. MICROCOPY CRÍTICA — PATRONES DE CONVERSIÓN

### Estados Vacíos (Empty States)
| Contexto | ❌ Malo | ✅ Bueno (Corey Haines) |
|----------|---------|-------------------------|
| Sin citas | "No hay citas" | **"Agenda tu primera cita → Tarda 30 seg"** |
| Sin pacientes | "Lista vacía" | **"Importa pacientes desde CSV/Excel → 1 clic"** |
| Sin recordatorios | "Sin recordatorios" | **"Activa recordatorios auto → Reduce no-shows 75%"** |

### Tooltips / Ayuda Contextual
- **Máx 140 caracteres**
- **Responden "¿Qué pasa si hago clic?"**
- **Ejemplo:** `"Envía WhatsApp automático 24h antes. Paciente confirma/cancela con 1 toque."`

### Mensajes de Error (Error States)
```
❌ "Error 500: Internal Server Error"
✅ "No pudimos guardar. Revisa tu conexión e intenta de nuevo. ¿Persiste? support@tudominio.com"
```

### Onboarding — Pasos con Valor Inmediato
```
Paso 1: "Conecta WhatsApp Business" → Valor: "Canal listo en 30 seg"
Paso 2: "Importa 5 pacientes de prueba" → Valor: "Datos reales en 1 min"
Paso 3: "Activa recordatorio automático" → Valor: "Primera cita confirmada sin llamar"
```

---

## 5. ESTRUCTURAS DE LANDING PAGE (Mobile-First)

### Above the Fold (Hero)
```
[HEADLINE: Beneficio principal cuantificado]
[SUBHEAD: Cómo funciona en 1 frase + prueba social]
[CTA PRIMARY: Verbo + Beneficio + Baja fricción]
[TRUST: Logos 3-5 clientes / "47 clínicas confían" / Rating 4.9★]
```

### Sección Problema → Solución (Alternating)
```
[PROBLEMA REAL]                    [CAPTURA APP: Solución visual]
"Pierdes 45 min/sem..."            [Dashboard: "Recordatorios: ON"]
[CONSECUENCIA: €12K/año]           [Métrica: "No-shows: 3%"]
```

### Sección Prueba Social (Específica)
```
"Antes perdía 2 hrs/día llamando. Ahora configuro y olvido.
— Dra. María González, Clínica San Rafael (47 pacientes/sem)"
```

### FAQ Conversión (Objecciones Reales)
| Objeción | Respuesta Copy |
|----------|----------------|
| "¿Requiere desarrollo?" | "Cero código. Configuras en panel visual." |
| "¿Y si paciente no tiene WhatsApp?" | "Fallback automático a Email + SMS." |
| "¿Seguridad de datos?" | "Cifrado AES-256. HIPAA/GDPR ready. DPA firmado." |

---

## 6. CHECKLIST DE ENTREGA COPY (Definition of Done)

- [ ] Estructura Problema → Consecuencia → Alivio validada en todas las páginas
- [ ] 0 clichés corporativos (grep lista negra = 0 resultados)
- [ ] Todos los CTA siguen fórmula: Verbo + Beneficio Cuantificado + Baja Fricción
- [ ] Microcopy: Empty states, tooltips, errores, onboarding → todos orientados a acción
- [ ] Pruebas sociales específicas (nombre, rol, métrica real)
- [ ] FAQ cubre top 5 objeciones reales de ventas
- [ ] A/B test plan definido para Hero CTA + Primary CTA