import { CheckCircle2, XCircle, AlertCircle, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface StructuredResultProps {
  result: unknown;
}

interface ResultItem {
  text: string;
  status: 'success' | 'error' | 'warning' | 'info' | 'neutral';
}

// Helper to detect status from text content
const detectStatus = (text: string): 'success' | 'error' | 'warning' | 'info' | 'neutral' => {
  const lowerText = text.toLowerCase();
  
  // Success indicators
  if (
    lowerText.includes('success') ||
    lowerText.includes('passed') ||
    lowerText.includes('completed') ||
    lowerText.includes('done') ||
    lowerText.includes('ok') ||
    lowerText.includes('úspěšn') ||
    lowerText.includes('splněn') ||
    lowerText.includes('hotov') ||
    lowerText.includes('povedl') ||
    lowerText.includes('✓') ||
    lowerText.includes('✔')
  ) {
    return 'success';
  }
  
  // Error indicators
  if (
    lowerText.includes('fail') ||
    lowerText.includes('error') ||
    lowerText.includes('failed') ||
    lowerText.includes('not found') ||
    lowerText.includes('chyb') ||
    lowerText.includes('selhal') ||
    lowerText.includes('nepovedl') ||
    lowerText.includes('nepodařil') ||
    lowerText.includes('neúspěšn') ||
    lowerText.includes('✗') ||
    lowerText.includes('✘') ||
    lowerText.includes('❌')
  ) {
    return 'error';
  }
  
  // Warning indicators
  if (
    lowerText.includes('warning') ||
    lowerText.includes('caution') ||
    lowerText.includes('attention') ||
    lowerText.includes('varování') ||
    lowerText.includes('pozor') ||
    lowerText.includes('upozorn') ||
    lowerText.includes('⚠')
  ) {
    return 'warning';
  }
  
  // Info indicators
  if (
    lowerText.includes('info') ||
    lowerText.includes('note') ||
    lowerText.includes('tip') ||
    lowerText.includes('poznámka') ||
    lowerText.includes('ℹ')
  ) {
    return 'info';
  }
  
  return 'neutral';
};

// Parse result into structured items
const parseResult = (result: unknown): ResultItem[] => {
  const items: ResultItem[] = [];
  
  if (!result) return items;
  
  // Handle string result
  if (typeof result === 'string') {
    // Split by newlines and filter empty lines
    const lines = result.split(/\n/).filter(line => line.trim());
    lines.forEach(line => {
      items.push({
        text: line.trim(),
        status: detectStatus(line),
      });
    });
    return items;
  }
  
  // Handle object result
  if (typeof result === 'object') {
    const obj = result as Record<string, unknown>;
    
    // Check for common result structures
    if ('output' in obj && typeof obj.output === 'string') {
      const lines = obj.output.split(/\n/).filter((line: string) => line.trim());
      lines.forEach((line: string) => {
        items.push({
          text: line.trim(),
          status: detectStatus(line),
        });
      });
    }
    
    if ('message' in obj && typeof obj.message === 'string') {
      items.push({
        text: obj.message,
        status: detectStatus(obj.message),
      });
    }
    
    if ('result' in obj && typeof obj.result === 'string') {
      items.push({
        text: obj.result,
        status: detectStatus(obj.result),
      });
    }
    
    if ('done' in obj) {
      items.push({
        text: `Done: ${obj.done}`,
        status: obj.done ? 'success' : 'error',
      });
    }
    
    if ('extracted_content' in obj && typeof obj.extracted_content === 'string') {
      const lines = obj.extracted_content.split(/\n/).filter((line: string) => line.trim());
      lines.forEach((line: string) => {
        items.push({
          text: line.trim(),
          status: detectStatus(line),
        });
      });
    }
    
    // If no common fields found, stringify the object
    if (items.length === 0) {
      const jsonStr = JSON.stringify(result, null, 2);
      items.push({
        text: jsonStr,
        status: 'neutral',
      });
    }
  }
  
  return items;
};

const StatusIcon = ({ status }: { status: ResultItem['status'] }) => {
  switch (status) {
    case 'success':
      return <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />;
    case 'error':
      return <XCircle className="h-5 w-5 text-destructive flex-shrink-0" />;
    case 'warning':
      return <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0" />;
    case 'info':
      return <Info className="h-5 w-5 text-blue-500 flex-shrink-0" />;
    default:
      return <div className="w-5 h-5 flex-shrink-0" />;
  }
};

export default function StructuredResult({ result }: StructuredResultProps) {
  const { i18n } = useTranslation();
  const items = parseResult(result);
  
  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>{i18n.language === 'cs' ? 'Žádný výsledek' : 'No result'}</p>
      </div>
    );
  }
  
  // Check if it's just a raw JSON (single neutral item with JSON)
  if (items.length === 1 && items[0].status === 'neutral' && items[0].text.startsWith('{')) {
    return (
      <pre className="p-4 rounded-lg bg-muted overflow-x-auto text-sm font-mono">
        {items[0].text}
      </pre>
    );
  }
  
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div
          key={index}
          className={cn(
            'flex items-start gap-3 p-3 rounded-lg border',
            item.status === 'success' && 'bg-green-500/10 border-green-500/30',
            item.status === 'error' && 'bg-destructive/10 border-destructive/30',
            item.status === 'warning' && 'bg-yellow-500/10 border-yellow-500/30',
            item.status === 'info' && 'bg-blue-500/10 border-blue-500/30',
            item.status === 'neutral' && 'bg-muted border-border',
          )}
        >
          <StatusIcon status={item.status} />
          <p
            className={cn(
              'text-sm whitespace-pre-wrap',
              item.status === 'success' && 'text-green-700 dark:text-green-400',
              item.status === 'error' && 'text-destructive',
              item.status === 'warning' && 'text-yellow-700 dark:text-yellow-400',
              item.status === 'info' && 'text-blue-700 dark:text-blue-400',
              item.status === 'neutral' && 'text-foreground',
            )}
          >
            {item.text}
          </p>
        </div>
      ))}
    </div>
  );
}
