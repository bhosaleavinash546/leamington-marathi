import { useEffect, useState } from 'react';
import api from '../utils/api';

interface System    { id: number; code: string; name: string; icon?: string; }
interface Subsystem { id: number; system_id: number; code: string; name: string; }
interface Component { id: number; subsystem_id: number; code: string; name: string; }

export interface VehicleFilter {
  systemId?:    number;
  subsystemId?: number;
  componentId?: number;
}

interface Props {
  onChange: (filter: VehicleFilter) => void;
}

export default function VehicleHierarchyFilter({ onChange }: Props) {
  const [systems,    setSystems]    = useState<System[]>([]);
  const [subsystems, setSubsystems] = useState<Subsystem[]>([]);
  const [components, setComponents] = useState<Component[]>([]);

  const [selSystem,    setSelSystem]    = useState<number | ''>('');
  const [selSubsystem, setSelSubsystem] = useState<number | ''>('');
  const [selComponent, setSelComponent] = useState<number | ''>('');

  const [loadingSub,  setLoadingSub]  = useState(false);
  const [loadingComp, setLoadingComp] = useState(false);

  useEffect(() => {
    api.get<System[]>('/vehicle/systems').then((r) => setSystems(r.data));
  }, []);

  const handleSystemChange = async (val: string) => {
    const id = val ? parseInt(val) : '';
    setSelSystem(id);
    setSelSubsystem('');
    setSelComponent('');
    setSubsystems([]);
    setComponents([]);
    if (id) {
      setLoadingSub(true);
      const r = await api.get<Subsystem[]>(`/vehicle/subsystems?systemId=${id}`);
      setSubsystems(r.data);
      setLoadingSub(false);
    }
    onChange({ systemId: id || undefined });
  };

  const handleSubsystemChange = async (val: string) => {
    const id = val ? parseInt(val) : '';
    setSelSubsystem(id);
    setSelComponent('');
    setComponents([]);
    if (id) {
      setLoadingComp(true);
      const r = await api.get<Component[]>(`/vehicle/components?subsystemId=${id}`);
      setComponents(r.data);
      setLoadingComp(false);
    }
    onChange({ systemId: selSystem || undefined, subsystemId: id || undefined });
  };

  const handleComponentChange = (val: string) => {
    const id = val ? parseInt(val) : '';
    setSelComponent(id);
    onChange({ systemId: selSystem || undefined, subsystemId: selSubsystem || undefined, componentId: id || undefined });
  };

  const handleClear = () => {
    setSelSystem(''); setSelSubsystem(''); setSelComponent('');
    setSubsystems([]); setComponents([]);
    onChange({});
  };

  return (
    <div className="hierarchy-filter">
      {/* System */}
      <div className="hf-group">
        <label>Vehicle System</label>
        <select className="form-control" value={selSystem} onChange={(e) => handleSystemChange(e.target.value)}>
          <option value="">All Systems</option>
          {systems.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Subsystem */}
      <div className="hf-group">
        <label>Subsystem</label>
        <select
          className="form-control"
          value={selSubsystem}
          onChange={(e) => handleSubsystemChange(e.target.value)}
          disabled={!selSystem || loadingSub}
        >
          <option value="">{loadingSub ? 'Loading…' : 'All Subsystems'}</option>
          {subsystems.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Component */}
      <div className="hf-group">
        <label>Component</label>
        <select
          className="form-control"
          value={selComponent}
          onChange={(e) => handleComponentChange(e.target.value)}
          disabled={!selSubsystem || loadingComp}
        >
          <option value="">{loadingComp ? 'Loading…' : 'All Components'}</option>
          {components.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {(selSystem || selSubsystem || selComponent) && (
        <div className="hf-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={handleClear} style={{ whiteSpace: 'nowrap' }}>
            Clear filter
          </button>
        </div>
      )}
    </div>
  );
}
