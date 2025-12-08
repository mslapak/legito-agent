import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Key, Plus, Loader2, Pencil, Trash2, Eye, EyeOff, User } from 'lucide-react';

interface Credential {
  id: string;
  name: string;
  username: string;
  password: string;
  description: string | null;
  created_at: string;
}

interface ProjectCredentialsProps {
  projectId: string;
}

export default function ProjectCredentials({ projectId }: ProjectCredentialsProps) {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCredential, setEditingCredential] = useState<Credential | null>(null);
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
  const [formData, setFormData] = useState({
    name: 'Výchozí účet',
    username: '',
    password: '',
    description: '',
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchCredentials();
  }, [projectId]);

  const fetchCredentials = async () => {
    try {
      const { data, error } = await supabase
        .from('project_credentials')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setCredentials(data || []);
    } catch (error) {
      console.error('Error fetching credentials:', error);
    } finally {
      setLoading(false);
    }
  };

  const openCreateDialog = () => {
    setEditingCredential(null);
    setFormData({ name: 'Výchozí účet', username: '', password: '', description: '' });
    setIsDialogOpen(true);
  };

  const openEditDialog = (credential: Credential) => {
    setEditingCredential(credential);
    setFormData({
      name: credential.name,
      username: credential.username,
      password: credential.password,
      description: credential.description || '',
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.username.trim() || !formData.password.trim()) {
      toast.error('Vyplňte uživatelské jméno a heslo');
      return;
    }

    setIsSaving(true);
    try {
      if (editingCredential) {
        const { error } = await supabase
          .from('project_credentials')
          .update({
            name: formData.name,
            username: formData.username,
            password: formData.password,
            description: formData.description || null,
          })
          .eq('id', editingCredential.id);

        if (error) throw error;
        toast.success('Přihlašovací údaje aktualizovány');
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Uživatel není přihlášen');

        const { error } = await supabase
          .from('project_credentials')
          .insert({
            user_id: user.id,
            project_id: projectId,
            name: formData.name,
            username: formData.username,
            password: formData.password,
            description: formData.description || null,
          });

        if (error) throw error;
        toast.success('Přihlašovací údaje uloženy');
      }

      setIsDialogOpen(false);
      fetchCredentials();
    } catch (error) {
      console.error('Error saving credentials:', error);
      toast.error('Nepodařilo se uložit přihlašovací údaje');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (credentialId: string) => {
    try {
      const { error } = await supabase
        .from('project_credentials')
        .delete()
        .eq('id', credentialId);

      if (error) throw error;
      toast.success('Přihlašovací údaje smazány');
      fetchCredentials();
    } catch (error) {
      console.error('Error deleting credentials:', error);
      toast.error('Nepodařilo se smazat přihlašovací údaje');
    }
  };

  const togglePasswordVisibility = (id: string) => {
    setShowPassword(prev => ({ ...prev, [id]: !prev[id] }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h5 className="text-sm font-medium flex items-center gap-2">
          <Key className="w-4 h-4 text-primary" />
          Přihlašovací údaje
        </h5>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" onClick={openCreateDialog}>
              <Plus className="mr-1 h-3 w-3" />
              Přidat
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>
                  {editingCredential ? 'Upravit přihlašovací údaje' : 'Nové přihlašovací údaje'}
                </DialogTitle>
                <DialogDescription>
                  Tyto údaje budou automaticky použity při spouštění testů vyžadujících přihlášení.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="cred-name">Název účtu</Label>
                  <Input
                    id="cred-name"
                    placeholder="Výchozí účet"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cred-username">Uživatelské jméno / Email *</Label>
                  <Input
                    id="cred-username"
                    placeholder="user@example.com"
                    value={formData.username}
                    onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cred-password">Heslo *</Label>
                  <Input
                    id="cred-password"
                    type="password"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cred-description">Popis (volitelně)</Label>
                  <Input
                    id="cred-description"
                    placeholder="Admin účet pro testing"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Zrušit
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Ukládám...
                    </>
                  ) : (
                    editingCredential ? 'Uložit změny' : 'Uložit'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {credentials.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          Žádné uložené přihlašovací údaje. Pro automatické přihlášení při testech přidejte credentials.
        </p>
      ) : (
        <div className="space-y-2">
          {credentials.map((cred) => (
            <Card key={cred.id} className="bg-muted/30">
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm">{cred.name}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span>Login:</span>
                        <code className="bg-background px-1 rounded">{cred.username}</code>
                      </div>
                      <div className="flex items-center gap-2">
                        <span>Heslo:</span>
                        <code className="bg-background px-1 rounded">
                          {showPassword[cred.id] ? cred.password : '••••••••'}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => togglePasswordVisibility(cred.id)}
                        >
                          {showPassword[cred.id] ? (
                            <EyeOff className="h-3 w-3" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                      {cred.description && (
                        <div className="text-muted-foreground/70 italic">{cred.description}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openEditDialog(cred)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Smazat přihlašovací údaje?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Tato akce je nevratná. Přihlašovací údaje "{cred.name}" budou permanentně smazány.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Zrušit</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(cred.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Smazat
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
