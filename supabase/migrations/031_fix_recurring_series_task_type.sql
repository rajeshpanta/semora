-- Migration 030 originally left the json text value uncast for the enum
-- tasks.type column. Fresh databases already receive the corrected 030; this
-- small repair updates databases that applied the first version.
do $repair$
declare
  function_definition text;
begin
  select pg_get_functiondef(
    'public.update_recurring_task_series(uuid,text,jsonb)'::regprocedure
  ) into function_definition;

  if position('::public.task_type' in function_definition) = 0 then
    function_definition := replace(
      function_definition,
      'then p_patch ->> ''type'' else task.type end',
      'then (p_patch ->> ''type'')::public.task_type else task.type end'
    );
  end if;

  if position('::public.task_type' in function_definition) = 0 then
    raise exception 'Could not repair update_recurring_task_series task type cast';
  end if;

  execute function_definition;
end;
$repair$;
