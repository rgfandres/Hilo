-- 0045 · Tampoco se borran clientes: una ficha que entra en el circuito solo se anula (el encargo),
-- para que no bailen los números y a fin de año se sepa cuántos se anularon y por qué.
drop function if exists borrar_cliente(uuid);

select 'ok 0045' as r;
