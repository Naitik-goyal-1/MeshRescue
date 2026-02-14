
export type ResourceType = 'Food' | 'Water' | 'Medical' | 'Shelter' | 'Supplies' | 'Other';
export type ResourcePriority = 'Low' | 'Medium' | 'High';
export type ResourceStatus = 'Available' | 'Limited' | 'Unavailable';

export interface ResourceItem {
  id: string; // Unique UUID
  roomId: string;
  type: ResourceType;
  title: string;
  description: string;
  location: string;
  createdBy: string; // Peer ID
  createdAt: number;
  updatedAt: number;
  status: ResourceStatus;
  priority: ResourcePriority;
  isDeleted: boolean; // Soft delete
  verifiedCount: number;
}

export interface ResourcePacketPayload {
  type: 'RESOURCE_ACTION';
  action: 'CREATE' | 'UPDATE';
  data: ResourceItem;
}
