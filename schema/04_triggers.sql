create or replace function update_chat_session_updated_at()
returns trigger as $$
begin
  update chat_sessions
  set updated_at = now()
  where id = new.session_id;
  return new;
end;
$$ language plpgsql;

create trigger update_chat_session_on_new_message
after insert on chat_messages
for each row
execute procedure update_chat_session_updated_at();
