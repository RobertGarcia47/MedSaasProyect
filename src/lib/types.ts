// Tipos TypeScript que reflejan el esquema de Supabase (medsaas_schema.sql, 2026-06-16).
// Usar SOLO para lecturas planas de tablas. Campos cifrados (bytea *_enc) no se incluyen
// aquí porque nunca viajan al frontend en crudo — se acceden únicamente mediante RPCs.

export type SexoEnum = 'M' | 'F';
export type GrupoSanguineo = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | 'desconocido';

export interface Paciente {
  id: string;
  clinica_id: string;
  medico_id: string;
  nombre: string;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  fecha_nacimiento: string | null; // date → "YYYY-MM-DD"
  sexo: SexoEnum | null;
  grupo_sanguineo: GrupoSanguineo | null;
  telefono: string | null;
  email: string | null;
  curp: string | null;
  created_at: string;
}

export interface Expediente {
  id: string;
  paciente_id: string;
  clinica_id: string;
  // antecedentes_enc omitido — solo vía RPC guardar_antecedentes / obtener_antecedentes
  created_at: string;
}

export interface ExpedienteAlergia {
  id: string;
  expediente_id: string;
  clinica_id: string;
  alergia: string;
}

export interface Consulta {
  id: string;
  expediente_id: string;
  clinica_id: string;
  medico_id: string;
  fecha: string; // timestamp → ISO string
  peso_kg: number | null;
  talla_cm: number | null;
  ta_sistolica: number | null;
  ta_diastolica: number | null;
  fc: number | null;
  temp_c: number | null;
  // motivo_enc, notas_enc omitidos — solo vía RPC crear_consulta / obtener_consultas
  created_at: string;
}

export interface ConsultaDiagnostico {
  id: string;
  consulta_id: string;
  clinica_id: string;
  cie10_codigo: string;
  es_principal: boolean;
  // cie10 → nested join result
  cie10?: { descripcion: string } | null;
}

export interface Cie10 {
  codigo: string;
  descripcion: string;
}

export interface Plan {
  id: number;
  nombre: string;
  precio_mxn: number;
  max_medicos: number;
  max_asistentes_por_medico: number;
  max_pacientes: number | null;
  features: Record<string, unknown> | null;
  activo: boolean;
}

export interface Especialidad {
  id: number;
  nombre: string;
}

export interface MedicoDetalle {
  profile_id: string;
  prefijo: string | null;
  cedula_profesional: string;
  universidad: string | null;
  especialidad_id: number | null;
}
