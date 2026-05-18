import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { UserPlus, Loader2, Eye, EyeOff } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

const ALL_ROLES: AppRole[] = ["trainer", "admin", "practitioner", "trainee", "client", "community_participant", "gamer"];

interface CreateUserFormProps {
  onCreated?: () => void;
}

export default function CreateUserForm({ onCreated }: CreateUserFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<AppRole[]>(["client"]);
  const [showPassword, setShowPassword] = useState(false);
  const [creating, setCreating] = useState(false);

  function toggleRole(role: AppRole) {
    setSelectedRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  }

  async function handleCreate() {
    if (!email || !password) {
      toast({ title: "Missing fields", description: "Email and password are required.", variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: "Weak password", description: "Password must be at least 6 characters.", variant: "destructive" });
      return;
    }

    setCreating(true);
    const { data, error } = await supabase.functions.invoke("create-user", {
      body: { email, password, first_name: firstName, last_name: lastName, roles: selectedRoles },
    });

    if (error || data?.error) {
      toast({ title: "Error creating user", description: data?.error || error?.message, variant: "destructive" });
    } else {
      toast({ title: "User created!", description: `${email} has been created with roles: ${selectedRoles.join(", ")}` });
      setEmail("");
      setPassword("");
      setFirstName("");
      setLastName("");
      setSelectedRoles(["client"]);
      onCreated?.();
    }
    setCreating(false);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <UserPlus className="h-5 w-5 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Create New User</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">First Name</label>
          <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" className="mt-1" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Last Name</label>
          <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" className="mt-1" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Email *</label>
          <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@example.com" className="mt-1" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Password *</label>
          <div className="relative mt-1">
            <Input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Min 6 characters"
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground">Assign Roles</label>
        <div className="flex flex-wrap gap-3 mt-2">
          {ALL_ROLES.map(role => (
            <label key={role} className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={selectedRoles.includes(role)}
                onCheckedChange={() => toggleRole(role)}
              />
              <span className="text-sm capitalize text-foreground">{role.replace(/_/g, " ")}</span>
            </label>
          ))}
        </div>
      </div>

      <Button onClick={handleCreate} disabled={creating} className="w-full sm:w-auto">
        {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
        Create User
      </Button>
    </div>
  );
}
