import { useState } from 'react';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@boardly/ui/select';
import {
  AUTH_PLACEHOLDERS,
  DATE_FORMATS,
  FIELD_MAPPING_MODES,
  flattenJsonSchema,
  type ApiModuleId,
  type DateFormatId,
  type FieldMappingMode,
} from '@boardly/shared-types';
import { Braces, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { crmFieldOptions, emptyMapping, type MappingDraft } from './lib/outboundState';

interface Props {
  module: ApiModuleId;
  mappings: MappingDraft[];
  authEnabled: boolean;
  onChange: (mappings: MappingDraft[]) => void;
}

export function OutboundMappingEditor({ module, mappings, authEnabled, onChange }: Props) {
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [schema, setSchema] = useState('');
  const fields = crmFieldOptions(module);

  const update = (index: number, patch: Partial<MappingDraft>) => {
    onChange(mappings.map((mapping, i) => (i === index ? { ...mapping, ...patch } : mapping)));
  };

  const importSchema = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(schema);
    } catch {
      toast.error('That is not valid JSON');
      return;
    }
    const paths = flattenJsonSchema(parsed);
    if (paths.length === 0) {
      toast.error('No fields found in that JSON');
      return;
    }
    const existing = new Set(mappings.map((mapping) => mapping.targetPath));
    const added = paths.filter((path) => !existing.has(path)).map((path) => emptyMapping(path));
    onChange([...mappings, ...added]);
    setSchema('');
    setSchemaOpen(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium">Payload mapping</p>
          <p className="text-[11px] text-muted-foreground">
            With no mappings the full {module} record is sent as <code>{'{ entity }'}</code>.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-[11px]"
            onClick={() => setSchemaOpen((open) => !open)}
          >
            <Braces className="h-3.5 w-3.5" /> Paste JSON schema
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-[11px]"
            onClick={() => onChange([...mappings, emptyMapping()])}
          >
            <Plus className="h-3.5 w-3.5" /> Add row
          </Button>
        </div>
      </div>

      {schemaOpen && (
        <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
          <textarea
            value={schema}
            onChange={(e) => setSchema(e.target.value)}
            rows={5}
            placeholder={'{\n  "title": "",\n  "owner": { "email": "" }\n}'}
            className="w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            aria-label="JSON schema to map from"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-[11px]"
              onClick={() => {
                setSchemaOpen(false);
                setSchema('');
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 text-[11px]"
              disabled={!schema.trim()}
              onClick={importSchema}
            >
              Generate target rows
            </Button>
          </div>
        </div>
      )}

      {mappings.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/10 px-3 py-4 text-center text-[11px] text-muted-foreground">
          No mappings yet. Add rows to shape the payload your destination expects.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="hidden gap-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground lg:grid lg:grid-cols-[1fr_120px_1fr_110px_32px]">
            <span>Target path</span>
            <span>Source</span>
            <span>Value</span>
            <span>Format</span>
            <span />
          </div>
          {mappings.map((mapping, index) => (
            <div
              key={index}
              className="grid gap-2 rounded-xl border bg-card/60 p-2.5 lg:grid-cols-[1fr_120px_1fr_110px_32px] lg:items-center lg:rounded-none lg:border-0 lg:bg-transparent lg:p-1"
            >
              <Input
                value={mapping.targetPath}
                onChange={(e) => update(index, { targetPath: e.target.value })}
                placeholder="items[].rate"
                aria-label={`Mapping ${index + 1} target path`}
                className="h-8 font-mono text-xs"
              />
              <Select
                value={mapping.mode}
                onValueChange={(mode) => update(index, { mode: mode as FieldMappingMode })}
              >
                <SelectTrigger className="h-8 text-xs" aria-label="Mapping source type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_MAPPING_MODES.map((mode) => (
                    <SelectItem
                      key={mode.id}
                      value={mode.id}
                      disabled={mode.id === 'auth_token' && !authEnabled}
                    >
                      {mode.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {mapping.mode === 'crm_field' ? (
                <Select
                  value={mapping.source || undefined}
                  onValueChange={(source) => update(index, { source })}
                >
                  <SelectTrigger className="h-8 text-xs" aria-label="CRM field">
                    <SelectValue placeholder="Choose field" />
                  </SelectTrigger>
                  <SelectContent>
                    {fields.map((field) => (
                      <SelectItem key={field.id} value={field.id}>
                        {field.label}
                        <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                          {field.id}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : mapping.mode === 'static' ? (
                <Input
                  value={mapping.value}
                  onChange={(e) => update(index, { value: e.target.value })}
                  placeholder="Boardly"
                  aria-label="Static value"
                  className="h-8 text-xs"
                />
              ) : (
                <Select value={mapping.token} onValueChange={(token) => update(index, { token })}>
                  <SelectTrigger className="h-8 text-xs" aria-label="Auth token placeholder">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AUTH_PLACEHOLDERS.map((placeholder) => (
                      <SelectItem key={placeholder} value={placeholder}>
                        {placeholder}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Select
                value={mapping.dateFormat}
                onValueChange={(format) => update(index, { dateFormat: format as DateFormatId })}
              >
                <SelectTrigger className="h-8 text-xs" aria-label="Date format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATE_FORMATS.map((format) => (
                    <SelectItem key={format.id} value={format.id}>
                      {format.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 justify-self-end text-muted-foreground hover:text-rose-500"
                aria-label={`Remove mapping ${index + 1}`}
                onClick={() => onChange(mappings.filter((_, i) => i !== index))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
