import React from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { ExpandMore } from '@mui/icons-material';
import type { SelectChangeEvent } from '@mui/material/Select';
import type { TemplateCatalogEntry } from '@lis/shared';
import { useLanguage } from '../../hooks/useLanguage';
import {
  normalizeTemplateDefinition,
  resolveTemplateFormValues,
  type NormalizedTemplateField,
  type RawTemplateDefinition,
  type TemplateFormValue,
  type TemplateFormValues,
} from '../../utils/templateForms';

interface StructuredTemplateEditorProps {
  templateLabel: string;
  outputLabel: string;
  placeholder?: string;
  templates: TemplateCatalogEntry[];
  selectedTemplateKey: string;
  onTemplateKeyChange: (templateKey: string) => void;
  definition?: RawTemplateDefinition;
  values: TemplateFormValues;
  onValuesChange: (values: TemplateFormValues) => void;
  rawText: string;
  onRawTextChange: (text: string) => void;
  loading?: boolean;
  selectTestId?: string;
  outputTestId?: string;
  loadingText: string;
  unavailableText: string;
}

function renderValue(value: TemplateFormValue | undefined, options: NormalizedTemplateField['options']): string {
  if (Array.isArray(value)) {
    return value
      .map((entry) => options?.find((option) => option.value === entry)?.label ?? entry)
      .join(', ');
  }

  return value ?? '';
}

export default function StructuredTemplateEditor({
  templateLabel,
  outputLabel,
  placeholder,
  templates,
  selectedTemplateKey,
  onTemplateKeyChange,
  definition,
  values,
  onValuesChange,
  rawText,
  onRawTextChange,
  loading = false,
  selectTestId,
  outputTestId,
  loadingText,
  unavailableText,
}: StructuredTemplateEditorProps) {
  const { lang, direction } = useLanguage();
  const normalizedDefinition = normalizeTemplateDefinition(definition ?? null);
  const effectiveValues = resolveTemplateFormValues(normalizedDefinition, values);
  const textInputProps = { lang, dir: direction };

  const updateFieldValue = (fieldPath: string, value: TemplateFormValue) => {
    onValuesChange({ ...values, [fieldPath]: value });
  };

  const renderField = (field: NormalizedTemplateField): React.ReactNode => {
    if (field.kind === 'group') {
      return (
        <Box key={field.path} sx={{ pl: 1, borderLeft: '2px solid', borderColor: 'divider' }}>
          <Typography variant="body2" fontWeight={600} mb={1}>
            {field.label}
          </Typography>
          <Stack spacing={1.5}>
            {(field.children ?? []).map((childField) => renderField(childField))}
          </Stack>
        </Box>
      );
    }

    const currentValue = effectiveValues[field.path];

    if (field.inputType === 'select' || field.inputType === 'boolean') {
      return (
        <FormControl key={field.path} size="small" fullWidth>
          <InputLabel>{field.label}</InputLabel>
          <Select
            label={field.label}
            value={typeof currentValue === 'string' ? currentValue : ''}
            onChange={(event: SelectChangeEvent<string>) => updateFieldValue(field.path, event.target.value)}
          >
            <MenuItem value="">
              <em>-</em>
            </MenuItem>
            {(field.options ?? []).map((option) => (
              <MenuItem key={`${field.path}-${option.value}`} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      );
    }

    if (field.inputType === 'multi_select') {
      return (
        <FormControl key={field.path} size="small" fullWidth>
          <InputLabel>{field.label}</InputLabel>
          <Select
            multiple
            label={field.label}
            value={Array.isArray(currentValue) ? currentValue : []}
            onChange={(event) => {
              const nextValue = typeof event.target.value === 'string'
                ? event.target.value.split(',').filter(Boolean)
                : event.target.value;
              updateFieldValue(field.path, nextValue as string[]);
            }}
            renderValue={(selected) => renderValue(selected as string[], field.options)}
          >
            {(field.options ?? []).map((option) => (
              <MenuItem key={`${field.path}-${option.value}`} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      );
    }

    return (
      <TextField
        key={field.path}
        label={field.label}
        type={field.inputType === 'number' ? 'number' : field.inputType === 'date' ? 'date' : 'text'}
        multiline={field.inputType === 'textarea'}
        minRows={field.inputType === 'textarea' ? 3 : undefined}
        fullWidth
        size="small"
        value={typeof currentValue === 'string' ? currentValue : ''}
        onChange={(event) => updateFieldValue(field.path, event.target.value)}
        inputProps={textInputProps}
        InputLabelProps={field.inputType === 'date' ? { shrink: true } : undefined}
      />
    );
  };

  return (
    <Stack spacing={1.5}>
      <FormControl size="small" fullWidth>
        <InputLabel>{templateLabel}</InputLabel>
        <Select
          label={templateLabel}
          value={selectedTemplateKey}
          onChange={(event) => onTemplateKeyChange(event.target.value)}
          inputProps={selectTestId ? { 'data-testid': selectTestId } : undefined}
        >
          <MenuItem value="">-</MenuItem>
          {templates.map((template) => (
            <MenuItem key={template.templateKey} value={template.templateKey}>
              {template.title}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {!selectedTemplateKey && (
        <TextField
          label={outputLabel}
          multiline
          minRows={8}
          fullWidth
          value={rawText}
          onChange={(event) => onRawTextChange(event.target.value)}
          placeholder={placeholder}
          inputProps={{
            ...textInputProps,
            ...(outputTestId ? { 'data-testid': outputTestId, style: { fontFamily: 'monospace', fontSize: 13 } } : {}),
          }}
          sx={{ '& .MuiInputBase-root': { resize: 'vertical', overflow: 'auto' } }}
        />
      )}

      {selectedTemplateKey && loading && (
        <Box display="flex" alignItems="center" gap={1} py={1}>
          <CircularProgress size={18} />
          <Typography variant="body2" color="text.secondary">
            {loadingText}
          </Typography>
        </Box>
      )}

      {selectedTemplateKey && !loading && !normalizedDefinition && (
        <>
          <Alert severity="warning">{unavailableText}</Alert>
          <TextField
            label={outputLabel}
            multiline
            minRows={8}
            fullWidth
            value={rawText}
            onChange={(event) => onRawTextChange(event.target.value)}
            placeholder={placeholder}
            inputProps={{
              ...textInputProps,
              ...(outputTestId ? { 'data-testid': outputTestId, style: { fontFamily: 'monospace', fontSize: 13 } } : {}),
            }}
            sx={{ '& .MuiInputBase-root': { resize: 'vertical', overflow: 'auto' } }}
          />
        </>
      )}

      {selectedTemplateKey && normalizedDefinition && (
        <>
          {normalizedDefinition.sections.map((section) => (
            <Accordion key={section.id} defaultExpanded disableGutters>
              <AccordionSummary expandIcon={<ExpandMore />} sx={{ minHeight: 36, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
                <Typography variant="subtitle2" fontWeight={700}>
                  {section.title}
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 1 }}>
                <Stack spacing={1.5}>
                  {section.fields.map((field) => renderField(field))}
                </Stack>
              </AccordionDetails>
            </Accordion>
          ))}

          <TextField
            label={outputLabel}
            multiline
            minRows={6}
            fullWidth
            value={rawText}
            placeholder={placeholder}
            InputProps={{ readOnly: true }}
            inputProps={{
              ...textInputProps,
              ...(outputTestId ? { 'data-testid': outputTestId, style: { fontFamily: 'monospace', fontSize: 13 } } : {}),
            }}
            sx={{ '& .MuiInputBase-root': { resize: 'vertical', overflow: 'auto' } }}
          />
        </>
      )}
    </Stack>
  );
}