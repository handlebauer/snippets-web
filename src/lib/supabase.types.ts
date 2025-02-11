export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export type Database = {
    graphql_public: {
        Tables: {
            [_ in never]: never
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            graphql: {
                Args: {
                    operationName?: string
                    query?: string
                    variables?: Json
                    extensions?: Json
                }
                Returns: Json
            }
        }
        Enums: {
            [_ in never]: never
        }
        CompositeTypes: {
            [_ in never]: never
        }
    }
    public: {
        Tables: {
            editor_event_batches: {
                Row: {
                    created_at: string
                    event_count: number
                    events: Json
                    id: string
                    is_compressed: boolean | null
                    session_id: string
                    timestamp_end: number
                    timestamp_start: number
                }
                Insert: {
                    created_at?: string
                    event_count: number
                    events: Json
                    id?: string
                    is_compressed?: boolean | null
                    session_id: string
                    timestamp_end: number
                    timestamp_start: number
                }
                Update: {
                    created_at?: string
                    event_count?: number
                    events?: Json
                    id?: string
                    is_compressed?: boolean | null
                    session_id?: string
                    timestamp_end?: number
                    timestamp_start?: number
                }
                Relationships: [
                    {
                        foreignKeyName: 'editor_event_batches_session_id_fkey'
                        columns: ['session_id']
                        isOneToOne: false
                        referencedRelation: 'recording_sessions'
                        referencedColumns: ['id']
                    },
                ]
            }
            editor_snapshots: {
                Row: {
                    content: string
                    created_at: string
                    event_index: number
                    id: string
                    metadata: Json | null
                    session_id: string
                    timestamp: number
                }
                Insert: {
                    content: string
                    created_at?: string
                    event_index: number
                    id?: string
                    metadata?: Json | null
                    session_id: string
                    timestamp: number
                }
                Update: {
                    content?: string
                    created_at?: string
                    event_index?: number
                    id?: string
                    metadata?: Json | null
                    session_id?: string
                    timestamp?: number
                }
                Relationships: [
                    {
                        foreignKeyName: 'editor_snapshots_session_id_fkey'
                        columns: ['session_id']
                        isOneToOne: false
                        referencedRelation: 'recording_sessions'
                        referencedColumns: ['id']
                    },
                ]
            }
            profiles: {
                Row: {
                    avatar_url: string | null
                    github_access_token: string | null
                    github_connected: boolean | null
                    github_token_expires_at: string | null
                    github_url: string | null
                    github_username: string | null
                    id: string
                    updated_at: string | null
                    username: string | null
                    website: string | null
                }
                Insert: {
                    avatar_url?: string | null
                    github_access_token?: string | null
                    github_connected?: boolean | null
                    github_token_expires_at?: string | null
                    github_url?: string | null
                    github_username?: string | null
                    id: string
                    updated_at?: string | null
                    username?: string | null
                    website?: string | null
                }
                Update: {
                    avatar_url?: string | null
                    github_access_token?: string | null
                    github_connected?: boolean | null
                    github_token_expires_at?: string | null
                    github_url?: string | null
                    github_username?: string | null
                    id?: string
                    updated_at?: string | null
                    username?: string | null
                    website?: string | null
                }
                Relationships: []
            }
            recording_sessions: {
                Row: {
                    code: string
                    created_at: string
                    duration_ms: number | null
                    id: string
                    initial_content: string | null
                    linked_repo: string | null
                    status:
                        | Database['public']['Enums']['recording_session_status']
                        | null
                    type:
                        | Database['public']['Enums']['recording_session_type']
                        | null
                    user_id: string
                }
                Insert: {
                    code: string
                    created_at?: string
                    duration_ms?: number | null
                    id?: string
                    initial_content?: string | null
                    linked_repo?: string | null
                    status?:
                        | Database['public']['Enums']['recording_session_status']
                        | null
                    type?:
                        | Database['public']['Enums']['recording_session_type']
                        | null
                    user_id: string
                }
                Update: {
                    code?: string
                    created_at?: string
                    duration_ms?: number | null
                    id?: string
                    initial_content?: string | null
                    linked_repo?: string | null
                    status?:
                        | Database['public']['Enums']['recording_session_status']
                        | null
                    type?:
                        | Database['public']['Enums']['recording_session_type']
                        | null
                    user_id?: string
                }
                Relationships: [
                    {
                        foreignKeyName: 'recording_sessions_user_id_fkey'
                        columns: ['user_id']
                        isOneToOne: false
                        referencedRelation: 'profiles'
                        referencedColumns: ['id']
                    },
                ]
            }
            videos: {
                Row: {
                    created_at: string | null
                    duration: number | null
                    id: string
                    linked_repo: string | null
                    mime_type: string | null
                    name: string
                    profile_id: string
                    size: number | null
                    storage_path: string
                    thumbnail_url: string | null
                    trim_end: number | null
                    trim_start: number | null
                    updated_at: string | null
                }
                Insert: {
                    created_at?: string | null
                    duration?: number | null
                    id?: string
                    linked_repo?: string | null
                    mime_type?: string | null
                    name: string
                    profile_id: string
                    size?: number | null
                    storage_path: string
                    thumbnail_url?: string | null
                    trim_end?: number | null
                    trim_start?: number | null
                    updated_at?: string | null
                }
                Update: {
                    created_at?: string | null
                    duration?: number | null
                    id?: string
                    linked_repo?: string | null
                    mime_type?: string | null
                    name?: string
                    profile_id?: string
                    size?: number | null
                    storage_path?: string
                    thumbnail_url?: string | null
                    trim_end?: number | null
                    trim_start?: number | null
                    updated_at?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: 'videos_profile_id_fkey'
                        columns: ['profile_id']
                        isOneToOne: false
                        referencedRelation: 'profiles'
                        referencedColumns: ['id']
                    },
                ]
            }
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            compress_old_event_batches: {
                Args: Record<PropertyKey, never>
                Returns: undefined
            }
            fetch_user_recordings: {
                Args: {
                    profile_id_param: string
                }
                Returns: {
                    id: string
                    type: string
                    created_at: string
                    linked_repo: string
                    name: string
                    duration: number
                    size: number
                    storage_path: string
                    mime_type: string
                    thumbnail_url: string
                    session_code: string
                    initial_content: string
                    duration_ms: number
                    event_count: number
                    status: string
                    final_content: string
                    thumbnail_code: string
                }[]
            }
            finalize_recording_session: {
                Args: {
                    pairing_code: string
                    duration_ms: number
                }
                Returns: Json
            }
            get_github_repos_for_session: {
                Args: {
                    pairing_code: string
                }
                Returns: Json
            }
            store_editor_event_batch: {
                Args: {
                    pairing_code: string
                    timestamp_start: number
                    timestamp_end: number
                    events: Json
                    event_count: number
                }
                Returns: Json
            }
            store_editor_snapshot: {
                Args: {
                    pairing_code: string
                    event_index: number
                    timestamp: number
                    content: string
                    metadata: Json
                }
                Returns: Json
            }
            update_session_repository: {
                Args: {
                    pairing_code: string
                    repository_name: string
                }
                Returns: Json
            }
            update_session_status: {
                Args: {
                    new_status: Database['public']['Enums']['recording_session_status']
                    pairing_code: string
                }
                Returns: Json
            }
        }
        Enums: {
            editor_event_type: 'insert' | 'delete' | 'replace'
            recording_session_status:
                | 'draft'
                | 'recording'
                | 'saved'
                | 'deleted'
            recording_session_type: 'screen_recording' | 'code_editor'
        }
        CompositeTypes: {
            [_ in never]: never
        }
    }
}

type PublicSchema = Database[Extract<keyof Database, 'public'>]

export type Tables<
    PublicTableNameOrOptions extends
        | keyof (PublicSchema['Tables'] & PublicSchema['Views'])
        | { schema: keyof Database },
    TableName extends PublicTableNameOrOptions extends {
        schema: keyof Database
    }
        ? keyof (Database[PublicTableNameOrOptions['schema']]['Tables'] &
              Database[PublicTableNameOrOptions['schema']]['Views'])
        : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
    ? (Database[PublicTableNameOrOptions['schema']]['Tables'] &
          Database[PublicTableNameOrOptions['schema']]['Views'])[TableName] extends {
          Row: infer R
      }
        ? R
        : never
    : PublicTableNameOrOptions extends keyof (PublicSchema['Tables'] &
            PublicSchema['Views'])
      ? (PublicSchema['Tables'] &
            PublicSchema['Views'])[PublicTableNameOrOptions] extends {
            Row: infer R
        }
          ? R
          : never
      : never

export type TablesInsert<
    PublicTableNameOrOptions extends
        | keyof PublicSchema['Tables']
        | { schema: keyof Database },
    TableName extends PublicTableNameOrOptions extends {
        schema: keyof Database
    }
        ? keyof Database[PublicTableNameOrOptions['schema']]['Tables']
        : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
    ? Database[PublicTableNameOrOptions['schema']]['Tables'][TableName] extends {
          Insert: infer I
      }
        ? I
        : never
    : PublicTableNameOrOptions extends keyof PublicSchema['Tables']
      ? PublicSchema['Tables'][PublicTableNameOrOptions] extends {
            Insert: infer I
        }
          ? I
          : never
      : never

export type TablesUpdate<
    PublicTableNameOrOptions extends
        | keyof PublicSchema['Tables']
        | { schema: keyof Database },
    TableName extends PublicTableNameOrOptions extends {
        schema: keyof Database
    }
        ? keyof Database[PublicTableNameOrOptions['schema']]['Tables']
        : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
    ? Database[PublicTableNameOrOptions['schema']]['Tables'][TableName] extends {
          Update: infer U
      }
        ? U
        : never
    : PublicTableNameOrOptions extends keyof PublicSchema['Tables']
      ? PublicSchema['Tables'][PublicTableNameOrOptions] extends {
            Update: infer U
        }
          ? U
          : never
      : never

export type Enums<
    PublicEnumNameOrOptions extends
        | keyof PublicSchema['Enums']
        | { schema: keyof Database },
    EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
        ? keyof Database[PublicEnumNameOrOptions['schema']]['Enums']
        : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
    ? Database[PublicEnumNameOrOptions['schema']]['Enums'][EnumName]
    : PublicEnumNameOrOptions extends keyof PublicSchema['Enums']
      ? PublicSchema['Enums'][PublicEnumNameOrOptions]
      : never

export type CompositeTypes<
    PublicCompositeTypeNameOrOptions extends
        | keyof PublicSchema['CompositeTypes']
        | { schema: keyof Database },
    CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
        schema: keyof Database
    }
        ? keyof Database[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
        : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
    ? Database[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
    : PublicCompositeTypeNameOrOptions extends keyof PublicSchema['CompositeTypes']
      ? PublicSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
      : never
