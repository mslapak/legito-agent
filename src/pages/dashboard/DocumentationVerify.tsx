import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FileCheck } from 'lucide-react';
import DocumentationVerification from '@/components/DocumentationVerification';

interface Project {
  id: string;
  name: string;
  base_url: string | null;
}

export default function DocumentationVerify() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, base_url')
      .order('name');

    if (!error && data) {
      setProjects(data);
    }
  };

  const handleProjectChange = (id: string) => {
    setSelectedProjectId(id);
    const project = projects.find(p => p.id === id);
    setSelectedProject(project || null);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl gradient-accent flex items-center justify-center">
              <FileCheck className="w-6 h-6 text-accent-foreground" />
            </div>
            <div>
              <CardTitle>Ověření dokumentace</CardTitle>
              <CardDescription>
                Ověřte, zda je dokumentace vaší aplikace stále aktuální
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Vyberte projekt *</Label>
            <Select value={selectedProjectId} onValueChange={handleProjectChange}>
              <SelectTrigger>
                <SelectValue placeholder="Vyberte projekt pro ověření" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {projects.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nejdříve vytvořte projekt v sekci "Projekty"
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedProject && (
        <DocumentationVerification 
          projectId={selectedProject.id} 
          projectName={selectedProject.name}
          baseUrl={selectedProject.base_url || ''} 
        />
      )}
    </div>
  );
}
